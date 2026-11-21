import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { scanProjectSecurity, type SecurityAuditReport } from "./security-scanner.js";
import { reviewProject, type CodeReviewReport, type InlineSuppressionRecord } from "./code-review.js";

let warnedForgeDockerEnv = false;

export const GatePolicySchema = z
  .object({
    version: z.literal(1).default(1),
    security: z
      .object({
        maxCritical: z.number().int().min(0).default(0),
        maxHigh: z.number().int().min(0).default(0),
        maxMedium: z.number().int().min(0).default(10),
        failOnSecrets: z.boolean().default(true),
      })
      .strict()
      .default({
        maxCritical: 0,
        maxHigh: 0,
        maxMedium: 10,
        failOnSecrets: true,
      }),
    quality: z
      .object({
        maxReviewHigh: z.number().int().min(0).optional(),
        requireCleanGit: z.boolean().default(false),
        allowInlineSuppressions: z.boolean().default(true),
      })
      .strict()
      .default({
        maxReviewHigh: 0,
        requireCleanGit: false,
        allowInlineSuppressions: true,
      }),
    sandbox: z
      .object({
        required: z.boolean().default(false),
        disallowedTools: z.array(z.string()).default([]),
        profile: z.enum(["balanced", "hardened", "rootless-required"]).default("balanced"),
        requireRootless: z.boolean().default(false),
        maxMemory: z.string().default("512m"),
        maxCpus: z.number().default(1.0),
        maxProcesses: z.number().int().default(128),
      })
      .strict()
      .optional(),
  })
  .strict();

export type GatePolicy = z.infer<typeof GatePolicySchema>;

export const DEFAULT_GATE_POLICY: GatePolicy = GatePolicySchema.parse({
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
    allowInlineSuppressions: true,
  },
});

export interface NormalizedFinding {
  id: string;
  source: "security" | "review";
  category?: string | undefined;
  severity: "critical" | "high" | "medium" | "low";
  file: string;
  line: number;
  message: string;
  snippet?: string | undefined;
  snippetHash?: string | undefined;
  fingerprint: string;
  legacyFingerprint: string;
}

export interface GateEvaluation {
  passed: boolean;
  target: string;
  policy: GatePolicy;
  policySource: string;
  baselineSource?: string | undefined;
  violations: string[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    suppressedByBaseline: number;
    inlineSuppressions: number;
  };
  activeFindings: NormalizedFinding[];
  suppressedFindings: NormalizedFinding[];
  inlineSuppressions: InlineSuppressionRecord[];
  securityReport: SecurityAuditReport;
  reviewReport: CodeReviewReport;
}

/**
 * Robust detection of containerized execution environments.
 * Checks modern ANVIL env vars, legacy FORGE env vars (with deprecation warning),
 * standard container envs, and container filesystem/cgroup markers.
 */
export async function isRunningInContainer(): Promise<boolean> {
  if (process.env.FORGE_DOCKER_IMAGE && !process.env.ANVIL_DOCKER_IMAGE && !warnedForgeDockerEnv) {
    warnedForgeDockerEnv = true;
    process.stderr.write(
      "[DEPRECATION] FORGE_DOCKER_IMAGE is deprecated and will be removed in ANVIL v2.0. Use ANVIL_DOCKER_IMAGE instead.\n"
    );
  }

  if (
    process.env.ANVIL_CONTAINER ||
    process.env.ANVIL_DOCKER_IMAGE ||
    process.env.FORGE_DOCKER_IMAGE ||
    process.env.CONTAINER ||
    process.env.DOCKER_CONTAINER ||
    process.env.KUBERNETES_SERVICE_HOST
  ) {
    return true;
  }

  try {
    await Promise.any([access("/.dockerenv"), access("/run/.containerenv")]);
    return true;
  } catch {}

  try {
    const cgroup = await readFile("/proc/1/cgroup", "utf-8").catch(() => "");
    if (/(?:docker|containerd|podman|kubepods|sandbox)/i.test(cgroup)) {
      return true;
    }
  } catch {}

  return false;
}

/**
 * Computes a deterministic finding fingerprint.
 * If snippet content is provided, uses a SHA-256 content hash so line shifts don't invalidate baselines.
 */
export function computeFindingFingerprint(
  source: string,
  ruleId: string,
  filePath: string,
  line: number,
  snippet?: string
): string {
  const normFile = filePath.replace(/\\/g, "/");
  if (snippet && snippet.trim().length > 0) {
    const hash = createHash("sha256").update(snippet.trim()).digest("hex").slice(0, 16);
    return `${source}:${ruleId}:${normFile}:${hash}`;
  }
  return `${source}:${ruleId}:${normFile}:L${line}`;
}

/**
 * Validates raw policy objects using the strict Zod schema.
 * Throws a descriptive error on syntax or schema errors (fail-closed, rejecting typos).
 */
export function validateGatePolicy(rawContent: string, sourcePath: string): GatePolicy {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch (err) {
    throw new Error(
      `Failed to parse policy JSON at ${sourcePath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const result = GatePolicySchema.safeParse(parsed);
  if (!result.success) {
    const issueList = result.error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`).join("; ");
    throw new Error(`Policy schema validation failed at ${sourcePath}: ${issueList}`);
  }

  return result.data;
}

export async function loadGatePolicy(
  targetPath: string,
  explicitPolicyPath?: string
): Promise<{ policy: GatePolicy; source: string }> {
  if (explicitPolicyPath) {
    const fullPath = path.resolve(explicitPolicyPath);
    try {
      const raw = await readFile(fullPath, "utf-8");
      const policy = validateGatePolicy(raw, fullPath);
      return { policy, source: fullPath };
    } catch (err) {
      throw new Error(
        `Failed to load policy file at ${explicitPolicyPath}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const defaultPolicyPath = path.join(targetPath, ".anvil", "policy.json");
  let raw: string | undefined;
  try {
    raw = await readFile(defaultPolicyPath, "utf-8");
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "ENOENT") {
      return { policy: DEFAULT_GATE_POLICY, source: "default" };
    }
    throw new Error(`Cannot read policy file at ${defaultPolicyPath}: ${(err as Error).message}`);
  }

  const policy = validateGatePolicy(raw, defaultPolicyPath);
  return { policy, source: defaultPolicyPath };
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
        if (item.snippetHash && item.file && (item.rule || item.ruleId)) {
          const rule = item.rule ?? item.ruleId;
          const normFile = item.file.replace(/\\/g, "/");
          baseline.add(`${item.source ?? "security"}:${rule}:${normFile}:${item.snippetHash}`);
        }
      } else if (item && item.file && (item.rule || item.ruleId)) {
        const normFile = item.file.replace(/\\/g, "/");
        const rule = item.rule ?? item.ruleId;
        const source = item.source ?? "security";
        baseline.add(computeFindingFingerprint(source, rule, normFile, item.line ?? 0, item.snippet));
        baseline.add(`${source}:${rule}:${normFile}:${item.line ?? 0}`);
        baseline.add(`${source}:${rule}:${normFile}:L${item.line ?? 0}`);
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
        snippetHash: f.snippetHash,
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

  const violations: string[] = [];

  // Fail-closed scanner execution: if either engine throws, fail the gate
  let securityReport: SecurityAuditReport;
  let reviewReport: CodeReviewReport;

  try {
    securityReport = await scanProjectSecurity(targetPath);
  } catch (err) {
    violations.push(`Security scanner execution failed: ${err instanceof Error ? err.message : String(err)}`);
    securityReport = {
      scannedFiles: 0,
      durationMs: 0,
      passed: false,
      findings: [],
      summary: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
    };
  }

  try {
    reviewReport = await reviewProject(targetPath, { all: true });
  } catch (err) {
    violations.push(`Code review engine execution failed: ${err instanceof Error ? err.message : String(err)}`);
    reviewReport = {
      root: targetPath,
      generatedAt: new Date().toISOString(),
      scope: "source-files",
      base: "HEAD",
      filesReviewed: [],
      warnings: [],
      inlineSuppressions: [],
      summary: { high: 0, medium: 0, low: 0 },
      findings: [],
    };
  }

  const allFindings: NormalizedFinding[] = [];

  for (const s of securityReport.findings) {
    const line = s.line ?? 1;
    const normFile = s.file.replace(/\\/g, "/");
    const snippet = s.snippet;
    const snippetHash = snippet ? createHash("sha256").update(snippet.trim()).digest("hex").slice(0, 16) : undefined;
    const fp = computeFindingFingerprint("security", s.rule, normFile, line, snippet);
    const legacyFp = `security:${s.rule}:${normFile}:${line}`;

    allFindings.push({
      id: s.rule,
      source: "security",
      category: s.category,
      severity: s.severity,
      file: s.file,
      line,
      message: s.description,
      snippet,
      snippetHash,
      fingerprint: fp,
      legacyFingerprint: legacyFp,
    });
  }

  for (const r of reviewReport.findings) {
    const normFile = r.file.replace(/\\/g, "/");
    const snippet = r.evidence;
    const snippetHash = snippet ? createHash("sha256").update(snippet.trim()).digest("hex").slice(0, 16) : undefined;
    const fp = computeFindingFingerprint("review", r.ruleId, normFile, r.line, snippet);
    const legacyFp = `review:${r.ruleId}:${normFile}:${r.line}`;

    allFindings.push({
      id: r.ruleId,
      source: "review",
      severity: r.severity,
      file: r.file,
      line: r.line,
      message: r.recommendation,
      snippet,
      snippetHash,
      fingerprint: fp,
      legacyFingerprint: legacyFp,
    });
  }

  const activeFindings: NormalizedFinding[] = [];
  const suppressedFindings: NormalizedFinding[] = [];

  for (const f of allFindings) {
    const normFile = f.file.replace(/\\/g, "/");
    const altLineFp = `${f.source}:${f.id}:${normFile}:L${f.line}`;
    const isSuppressed =
      baseline.has(f.fingerprint) ||
      baseline.has(f.legacyFingerprint) ||
      baseline.has(altLineFp) ||
      (f.snippetHash && baseline.has(`${f.source}:${f.id}:${normFile}:${f.snippetHash}`));

    if (isSuppressed) {
      suppressedFindings.push(f);
    } else {
      activeFindings.push(f);
    }
  }

  const criticalFindings = activeFindings.filter((f) => f.severity === "critical");
  const highFindings = activeFindings.filter((f) => f.severity === "high");
  const mediumFindings = activeFindings.filter((f) => f.severity === "medium");
  const lowFindings = activeFindings.filter((f) => f.severity === "low");

  // Enforce threshold limits
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

  // Enforce failOnSecrets: strictly check category: "secret"
  if (effectivePolicy.security.failOnSecrets) {
    const secretFindings = activeFindings.filter((f) => f.source === "security" && f.category === "secret");
    if (secretFindings.length > 0 && !violations.some((v) => v.includes("Critical findings"))) {
      violations.push(
        `Policy forbids hardcoded secrets (failOnSecrets=true): found ${secretFindings.length} unsuppressed secret finding(s)`
      );
    }
  }

  // Enforce allowInlineSuppressions
  const inlineSuppressions = reviewReport.inlineSuppressions ?? [];
  if (effectivePolicy.quality?.allowInlineSuppressions === false && inlineSuppressions.length > 0) {
    violations.push(
      `Policy forbids inline suppressions (allowInlineSuppressions=false): detected ${inlineSuppressions.length} inline suppression(s) in code`
    );
  }

  // Enforce maxReviewHigh
  if (effectivePolicy.quality?.maxReviewHigh !== undefined) {
    const reviewHigh = highFindings.filter((f) => f.source === "review");
    if (
      reviewHigh.length > effectivePolicy.quality.maxReviewHigh &&
      !violations.some((v) => v.includes("High-severity findings"))
    ) {
      violations.push(
        `High-severity code review findings exceeded limit: found ${reviewHigh.length}, max allowed ${effectivePolicy.quality.maxReviewHigh}`
      );
    }
  }

  // Enforce requireCleanGit
  if (effectivePolicy.quality?.requireCleanGit) {
    try {
      const { execFileSync } = await import("node:child_process");
      const gitStatus = execFileSync("git", ["status", "--porcelain"], {
        cwd: targetPath,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (gitStatus.length > 0) {
        violations.push(
          "Policy requires clean git state (requireCleanGit=true): uncommitted changes detected in working copy"
        );
      }
    } catch (err) {
      violations.push(`Failed to verify clean git status: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Enforce sandbox requirements if configured
  if (effectivePolicy.sandbox?.required) {
    const isSandboxed = await isRunningInContainer();
    if (!isSandboxed) {
      violations.push(
        "Policy requires containerized sandbox execution (sandbox.required=true), but no active container environment was detected"
      );
    }
  }

  // Enforce disallowedTools if configured
  if (effectivePolicy.sandbox?.disallowedTools && effectivePolicy.sandbox.disallowedTools.length > 0) {
    const disallowedSet = new Set(effectivePolicy.sandbox.disallowedTools.map((t) => t.toLowerCase()));
    const toolViolations = activeFindings.filter((f) => {
      const lowerId = f.id.toLowerCase();
      const lowerMsg = f.message.toLowerCase();
      return Array.from(disallowedSet).some((tool) => lowerId.includes(tool) || lowerMsg.includes(tool));
    });

    if (toolViolations.length > 0) {
      violations.push(
        `Policy forbids execution of disallowed tools (${Array.from(disallowedSet).join(", ")}): detected ${toolViolations.length} matching finding(s)`
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
      inlineSuppressions: inlineSuppressions.length,
    },
    activeFindings,
    suppressedFindings,
    inlineSuppressions,
    securityReport,
    reviewReport,
  };
}
