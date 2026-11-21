import { readFile } from "node:fs/promises";
import path from "node:path";
import { scanProjectSecurity, type SecurityAuditReport } from "./security-scanner.js";
import { reviewProject, type CodeReviewReport } from "./code-review.js";

export interface GatePolicy {
  version: 1;
  security: {
    maxCritical: number;
    maxHigh: number;
    maxMedium: number;
    failOnSecrets: boolean;
  };
  quality: {
    maxReviewHigh?: number;
    requireCleanGit?: boolean;
  };
}

export const DEFAULT_GATE_POLICY: GatePolicy = {
  version: 1,
  security: {
    maxCritical: 0,
    maxHigh: 0,
    maxMedium: 10,
    failOnSecrets: true,
  },
  quality: {
    maxReviewHigh: 0,
    requireCleanGit: false,
  },
};

export interface NormalizedFinding {
  id: string;
  source: "security" | "review";
  severity: "critical" | "high" | "medium" | "low";
  file: string;
  line: number;
  message: string;
  fingerprint: string;
}

export interface GateEvaluation {
  passed: boolean;
  target: string;
  policy: GatePolicy;
  policySource: string;
  baselineSource?: string;
  violations: string[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    suppressedByBaseline: number;
  };
  activeFindings: NormalizedFinding[];
  suppressedFindings: NormalizedFinding[];
  securityReport: SecurityAuditReport;
  reviewReport: CodeReviewReport;
}

export function computeFindingFingerprint(source: string, ruleId: string, filePath: string, line: number): string {
  const normFile = filePath.replace(/\\/g, "/");
  return `${source}:${ruleId}:${normFile}:${line}`;
}

export async function loadGatePolicy(
  targetPath: string,
  explicitPolicyPath?: string
): Promise<{ policy: GatePolicy; source: string }> {
  if (explicitPolicyPath) {
    const fullPath = path.resolve(explicitPolicyPath);
    try {
      const raw = await readFile(fullPath, "utf-8");
      const parsed = JSON.parse(raw);
      const policy: GatePolicy = {
        version: 1,
        security: {
          maxCritical: typeof parsed.security?.maxCritical === "number" ? parsed.security.maxCritical : 0,
          maxHigh: typeof parsed.security?.maxHigh === "number" ? parsed.security.maxHigh : 0,
          maxMedium: typeof parsed.security?.maxMedium === "number" ? parsed.security.maxMedium : 10,
          failOnSecrets: typeof parsed.security?.failOnSecrets === "boolean" ? parsed.security.failOnSecrets : true,
        },
        quality: {
          ...(typeof parsed.quality?.maxReviewHigh === "number" ? { maxReviewHigh: parsed.quality.maxReviewHigh } : {}),
          requireCleanGit: Boolean(parsed.quality?.requireCleanGit),
        },
      };
      return { policy, source: fullPath };
    } catch (err) {
      throw new Error(
        `Failed to load policy file at ${explicitPolicyPath}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const defaultPolicyPath = path.join(targetPath, ".anvil", "policy.json");
  try {
    const raw = await readFile(defaultPolicyPath, "utf-8");
    const parsed = JSON.parse(raw);
    const policy: GatePolicy = {
      version: 1,
      security: {
        maxCritical: typeof parsed.security?.maxCritical === "number" ? parsed.security.maxCritical : 0,
        maxHigh: typeof parsed.security?.maxHigh === "number" ? parsed.security.maxHigh : 0,
        maxMedium: typeof parsed.security?.maxMedium === "number" ? parsed.security.maxMedium : 10,
        failOnSecrets: typeof parsed.security?.failOnSecrets === "boolean" ? parsed.security.failOnSecrets : true,
      },
      quality: {
        ...(typeof parsed.quality?.maxReviewHigh === "number" ? { maxReviewHigh: parsed.quality.maxReviewHigh } : {}),
        requireCleanGit: Boolean(parsed.quality?.requireCleanGit),
      },
    };
    return { policy, source: defaultPolicyPath };
  } catch {
    return { policy: DEFAULT_GATE_POLICY, source: "default" };
  }
}

export async function loadBaseline(baselinePath?: string): Promise<Set<string>> {
  const baseline = new Set<string>();
  if (!baselinePath) return baseline;
  const fullPath = path.resolve(baselinePath);
  try {
    const raw = await readFile(fullPath, "utf-8");
    const data = JSON.parse(raw);
    const items = Array.isArray(data.findings) ? data.findings : Array.isArray(data) ? data : [];
    for (const item of items) {
      if (typeof item === "string") {
        baseline.add(item);
      } else if (item && typeof item.fingerprint === "string") {
        baseline.add(item.fingerprint);
      } else if (item && item.file && (item.rule || item.ruleId)) {
        baseline.add(
          computeFindingFingerprint(item.source ?? "security", item.rule ?? item.ruleId, item.file, item.line ?? 0)
        );
      }
    }
    return baseline;
  } catch (err) {
    throw new Error(
      `Failed to load baseline file at ${baselinePath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export function generateBaselineJson(findings: NormalizedFinding[]): string {
  return JSON.stringify(
    {
      version: 1,
      generatedAt: new Date().toISOString(),
      count: findings.length,
      findings: findings.map((f) => ({
        fingerprint: f.fingerprint,
        source: f.source,
        ruleId: f.id,
        file: f.file,
        line: f.line,
        severity: f.severity,
        message: f.message,
      })),
    },
    null,
    2
  );
}

export interface EvaluateGateOptions {
  policyPath?: string | undefined;
  baselinePath?: string | undefined;
  failOnWarnings?: boolean | undefined;
}

export async function evaluateGate(targetPath: string, options: EvaluateGateOptions = {}): Promise<GateEvaluation> {
  const { policy, source: policySource } = await loadGatePolicy(targetPath, options.policyPath);
  const baseline = await loadBaseline(options.baselinePath);

  const effectivePolicy: GatePolicy = {
    ...policy,
    security: {
      ...policy.security,
      maxMedium: options.failOnWarnings ? 0 : policy.security.maxMedium,
    },
  };

  const [securityReport, reviewReport] = await Promise.all([
    scanProjectSecurity(targetPath),
    reviewProject(targetPath, { all: true }).catch(() => ({
      root: targetPath,
      generatedAt: new Date().toISOString(),
      scope: "source-files" as const,
      base: "HEAD",
      filesReviewed: [],
      warnings: [],
      summary: { high: 0, medium: 0, low: 0 },
      findings: [],
    })),
  ]);

  const allFindings: NormalizedFinding[] = [];

  for (const s of securityReport.findings) {
    const line = s.line ?? 1;
    const fp = computeFindingFingerprint("security", s.rule, s.file, line);
    allFindings.push({
      id: s.rule,
      source: "security",
      severity: s.severity,
      file: s.file,
      line,
      message: s.description,
      fingerprint: fp,
    });
  }

  for (const r of reviewReport.findings) {
    const fp = computeFindingFingerprint("review", r.ruleId, r.file, r.line);
    allFindings.push({
      id: r.ruleId,
      source: "review",
      severity: r.severity,
      file: r.file,
      line: r.line,
      message: r.recommendation,
      fingerprint: fp,
    });
  }

  const activeFindings: NormalizedFinding[] = [];
  const suppressedFindings: NormalizedFinding[] = [];

  for (const f of allFindings) {
    if (baseline.has(f.fingerprint)) {
      suppressedFindings.push(f);
    } else {
      activeFindings.push(f);
    }
  }

  const criticalFindings = activeFindings.filter((f) => f.severity === "critical");
  const highFindings = activeFindings.filter((f) => f.severity === "high");
  const mediumFindings = activeFindings.filter((f) => f.severity === "medium");
  const lowFindings = activeFindings.filter((f) => f.severity === "low");

  const violations: string[] = [];

  if (criticalFindings.length > effectivePolicy.security.maxCritical) {
    violations.push(
      `Critical findings exceeded limit: found ${criticalFindings.length}, max allowed ${effectivePolicy.security.maxCritical}`
    );
  }

  if (highFindings.length > effectivePolicy.security.maxHigh) {
    violations.push(
      `High-severity findings exceeded limit: found ${highFindings.length}, max allowed ${effectivePolicy.security.maxHigh}`
    );
  }

  if (mediumFindings.length > effectivePolicy.security.maxMedium) {
    violations.push(
      `Medium-severity findings exceeded limit: found ${mediumFindings.length}, max allowed ${effectivePolicy.security.maxMedium}`
    );
  }

  if (effectivePolicy.quality.maxReviewHigh !== undefined) {
    const reviewHigh = highFindings.filter((f) => f.source === "review");
    if (
      reviewHigh.length > effectivePolicy.quality.maxReviewHigh &&
      !violations.some((v) => v.includes("High-severity"))
    ) {
      violations.push(
        `High-severity code review findings exceeded limit: found ${reviewHigh.length}, max allowed ${effectivePolicy.quality.maxReviewHigh}`
      );
    }
  }

  const passed = violations.length === 0;

  return {
    passed,
    target: targetPath,
    policy: effectivePolicy,
    policySource,
    ...(options.baselinePath ? { baselineSource: options.baselinePath } : {}),
    violations,
    summary: {
      critical: criticalFindings.length,
      high: highFindings.length,
      medium: mediumFindings.length,
      low: lowFindings.length,
      suppressedByBaseline: suppressedFindings.length,
    },
    activeFindings,
    suppressedFindings,
    securityReport,
    reviewReport,
  };
}
