import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { scanProjectSecurity, type SecurityAuditReport } from "./security-scanner.js";
import { reviewProject, type CodeReviewReport, type InlineSuppressionRecord } from "./code-review.js";
import { analyzeGitChanges } from "./git-intelligence.js";
import { importExternalSarif } from "./sarif-formatter.js";
export { importExternalSarif } from "./sarif-formatter.js";

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
        allowInlineSuppressions: z.boolean().default(false),
        requireSuppressionReason: z.boolean().default(false),
        minConfidence: z.enum(["high", "medium", "low"]).default("medium"),
        diffOnly: z.boolean().default(false),
      })
      .strict()
      .default({
        maxReviewHigh: 0,
        requireCleanGit: false,
        allowInlineSuppressions: false,
        requireSuppressionReason: false,
        minConfidence: "medium",
        diffOnly: false,
      }),
    sandbox: z
      .object({
        required: z.boolean().default(false),
        disallowedTools: z.array(z.string()).default([]),
        profile: z.enum(["balanced", "hardened", "rootless-required"]).optional(),
        requireRootless: z.boolean().optional(),
        maxMemory: z.string().optional(),
        maxCpus: z.number().optional(),
        maxProcesses: z.number().int().optional(),
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
    allowInlineSuppressions: false,
    requireSuppressionReason: false,
    minConfidence: "medium",
    diffOnly: false,
  },
});

export interface NormalizedFinding {
  id: string;
  source: "security" | "review";
  category?: string | undefined;
  severity: "critical" | "high" | "medium" | "low";
  confidence?: "high" | "medium" | "low" | "heuristic" | undefined;
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
  diffBase?: string | undefined;
  violations: string[];
  warnings: string[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    suppressedByBaseline: number;
    inlineSuppressions: number;
    suppressedByDiff?: number;
    advisoryLowConfidence?: number;
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
 * If secretHash or snippet content is provided, uses a SHA-256 content hash so line shifts don't invalidate baselines.
 */
export function computeFindingFingerprint(
  source: string,
  ruleId: string,
  filePath: string,
  line: number,
  snippet?: string,
  secretHash?: string
): string {
  const normFile = filePath.replace(/\\/g, "/");
  if (secretHash) {
    return `${source}:${ruleId}:${normFile}:${secretHash}`;
  }
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
  explicitPolicyPath?: string,
  policyRef?: string
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

  if (policyRef) {
    try {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileAsync = promisify(execFile);
      const { stdout } = await execFileAsync("git", ["show", `${policyRef}:.anvil/policy.json`], {
        cwd: targetPath,
      });
      const policy = validateGatePolicy(stdout, `git:${policyRef}:.anvil/policy.json`);
      return { policy, source: `git:${policyRef}:.anvil/policy.json` };
    } catch (err) {
      throw new Error(
        `Failed to load policy from git ref "${policyRef}:.anvil/policy.json": ${err instanceof Error ? err.message : String(err)}`
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
        baseline.add(computeFindingFingerprint(source, rule, normFile, item.line ?? 0, item.snippet, item.secretHash));
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
  policyRef?: string | undefined;
  baselinePath?: string | undefined;
  failOnWarnings?: boolean | undefined;
  since?: string | undefined;
  diffOnly?: boolean | undefined;
  minConfidence?: "high" | "medium" | "low" | undefined;
  externalSarifPaths?: string[] | undefined;
}

export async function evaluateGate(targetPath: string, options: EvaluateGateOptions = {}): Promise<GateEvaluation> {
  const { policy, source: policySource } = await loadGatePolicy(targetPath, options.policyPath, options.policyRef);
  const baseline = await loadBaseline(options.baselinePath);

  const effectivePolicy: GatePolicy = {
    ...policy,
    security: {
      ...policy.security,
      maxMedium: options.failOnWarnings ? 0 : policy.security.maxMedium,
    },
    quality: {
      ...policy.quality,
      ...(options.minConfidence ? { minConfidence: options.minConfidence } : {}),
      ...(options.diffOnly !== undefined ? { diffOnly: options.diffOnly } : {}),
    },
  };

  const violations: string[] = [];
  const warnings: string[] = [];

  // Warn on advisory sandbox configuration during static code review gate
  if (effectivePolicy.sandbox) {
    const s = effectivePolicy.sandbox;
    if (s.profile || s.requireRootless || s.maxMemory || s.maxCpus || s.maxProcesses) {
      warnings.push(
        "Sandbox limits (profile, requireRootless, maxMemory, maxCpus, maxProcesses) are designated for containerized verification runs (anvil verify / staged-verification / container-sandbox). They are advisory and not evaluated during static code review gates."
      );
    }
  }

  // PR-Diff mode resolution
  let changedFilesSet: Set<string> | undefined;
  const diffBase = options.since ?? (effectivePolicy.quality?.diffOnly ? "HEAD" : undefined);
  if (diffBase) {
    try {
      const gitIntel = await analyzeGitChanges(targetPath, diffBase);
      changedFilesSet = new Set(
        gitIntel.changes.filter((c) => c.status !== "D").map((c) => c.file.replace(/\\/g, "/"))
      );
    } catch (err) {
      if (options.since) {
        throw new Error(
          `Git diff failed for --since ${options.since}: ${err instanceof Error ? err.message : String(err)}`
        );
      } else {
        warnings.push(
          `Could not determine git diff relative to ${diffBase}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

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
    const snippetHash =
      s.secretHash || (snippet ? createHash("sha256").update(snippet.trim()).digest("hex").slice(0, 16) : undefined);
    const fp = computeFindingFingerprint("security", s.rule, normFile, line, snippet, s.secretHash);
    const legacyFp = `security:${s.rule}:${normFile}:${line}`;

    allFindings.push({
      id: s.rule,
      source: "security",
      category: s.category,
      severity: s.severity,
      confidence: "high",
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
      confidence: r.confidence ?? "medium",
      file: r.file,
      line: r.line,
      message: r.recommendation,
      snippet,
      snippetHash,
      fingerprint: fp,
      legacyFingerprint: legacyFp,
    });
  }

  // Phase 3: Ingest external SARIF reports (Semgrep, CodeQL, AgentShield, etc.)
  if (options.externalSarifPaths && options.externalSarifPaths.length > 0) {
    for (const sarifPath of options.externalSarifPaths) {
      try {
        const externalFindings = await importExternalSarif(sarifPath);
        allFindings.push(...externalFindings);
      } catch (err) {
        violations.push(
          `Failed to ingest external SARIF from ${sarifPath}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  const activeFindings: NormalizedFinding[] = [];
  const suppressedFindings: NormalizedFinding[] = [];
  let suppressedByDiffCount = 0;
  const resolvedTarget = path.resolve(targetPath);

  for (const f of allFindings) {
    const normFile = f.file.replace(/\\/g, "/");

    // PR-diff filtering: if diff scope active, skip findings on untouched files
    if (changedFilesSet !== undefined) {
      const relFile = path.isAbsolute(normFile)
        ? path.relative(resolvedTarget, normFile).replace(/\\/g, "/")
        : normFile;
      if (!changedFilesSet.has(relFile) && !changedFilesSet.has(normFile)) {
        suppressedByDiffCount++;
        continue;
      }
    }

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

  // Confidence filtering: demote findings below minConfidence to non-blocking advisory notices
  const minConfidence = effectivePolicy.quality?.minConfidence ?? "medium";
  const confidenceRank: Record<string, number> = {
    high: 3,
    medium: 2,
    heuristic: 2,
    low: 1,
  };
  const minRank = confidenceRank[minConfidence] ?? 2;

  const blockingFindings: NormalizedFinding[] = [];
  const advisoryLowConfidenceFindings: NormalizedFinding[] = [];

  for (const f of activeFindings) {
    const rank = confidenceRank[f.confidence ?? "medium"] ?? 2;
    if (rank >= minRank) {
      blockingFindings.push(f);
    } else {
      advisoryLowConfidenceFindings.push(f);
    }
  }

  if (advisoryLowConfidenceFindings.length > 0) {
    warnings.push(
      `${advisoryLowConfidenceFindings.length} heuristic finding(s) with confidence below '${minConfidence}' were demoted to non-blocking advisory notices.`
    );
  }

  const criticalFindings = blockingFindings.filter((f) => f.severity === "critical");
  const highFindings = blockingFindings.filter((f) => f.severity === "high");
  const mediumFindings = blockingFindings.filter((f) => f.severity === "medium");
  const lowFindings = blockingFindings.filter((f) => f.severity === "low");

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

  // Enforce requireSuppressionReason: every inline suppression must provide a justification
  if (effectivePolicy.quality?.requireSuppressionReason && inlineSuppressions.length > 0) {
    const missingReason = inlineSuppressions.filter((s) => !s.reason || s.reason.trim().length === 0);
    if (missingReason.length > 0) {
      violations.push(
        `Policy requires suppression reasons (requireSuppressionReason=true): found ${missingReason.length} inline suppression(s) without a justification reason (use '-- reason')`
      );
    }
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

  // Enforce disallowedTools: exact command and script matching, never substring on messages
  if (effectivePolicy.sandbox?.disallowedTools && effectivePolicy.sandbox.disallowedTools.length > 0) {
    const disallowedList = effectivePolicy.sandbox.disallowedTools.map((t) => t.trim().toLowerCase()).filter(Boolean);

    // 1. Inspect package.json scripts for disallowed executable invocations
    try {
      const pkgPath = path.join(targetPath, "package.json");
      const pkgRaw = await readFile(pkgPath, "utf-8").catch(() => null);
      if (pkgRaw) {
        const pkgData = JSON.parse(pkgRaw);
        if (pkgData && typeof pkgData.scripts === "object" && pkgData.scripts !== null) {
          for (const [scriptName, scriptCmd] of Object.entries(pkgData.scripts)) {
            if (typeof scriptCmd !== "string") continue;
            for (const tool of disallowedList) {
              const escapedTool = tool.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
              const cmdRegex = new RegExp(`(?:^|[;&|\\s])${escapedTool}(?:\\s|[;&|]|$)`, "i");
              if (cmdRegex.test(scriptCmd)) {
                violations.push(
                  `Policy forbids execution of disallowed tool '${tool}' (sandbox.disallowedTools): package.json script '${scriptName}' invokes '${tool}'`
                );
              }
            }
          }
        }
      }
    } catch {}

    // 2. Inspect active findings code snippets using exact command boundaries
    for (const f of activeFindings) {
      if (!f.snippet) continue;
      for (const tool of disallowedList) {
        const escapedTool = tool.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const snippetRegex = new RegExp(`(?:["'\`\\s/\\\\]|^)${escapedTool}(?:["'\`\\s]|$)`, "i");
        if (snippetRegex.test(f.snippet)) {
          violations.push(
            `Policy forbids execution of disallowed tool '${tool}' (sandbox.disallowedTools): detected tool execution in ${f.file}:${f.line}`
          );
        }
      }
    }
  }

  const passed = violations.length === 0;

  return {
    passed,
    target: targetPath,
    policy: effectivePolicy,
    policySource,
    ...(options.baselinePath ? { baselineSource: options.baselinePath } : {}),
    ...(diffBase ? { diffBase } : {}),
    violations,
    warnings,
    summary: {
      critical: criticalFindings.length,
      high: highFindings.length,
      medium: mediumFindings.length,
      low: lowFindings.length,
      suppressedByBaseline: suppressedFindings.length,
      inlineSuppressions: inlineSuppressions.length,
      suppressedByDiff: suppressedByDiffCount,
      advisoryLowConfidence: advisoryLowConfidenceFindings.length,
    },
    activeFindings,
    suppressedFindings,
    inlineSuppressions,
    securityReport,
    reviewReport,
  };
}
