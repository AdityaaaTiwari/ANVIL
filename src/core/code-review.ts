import { readFile } from "node:fs/promises";
import path from "node:path";
import { analyzeGitChanges } from "./git-intelligence.js";

export type ReviewSeverity = "high" | "medium" | "low";
export type RuleConfidence = "high" | "medium" | "low" | "heuristic";

export interface ReviewFinding {
  ruleId: string;
  severity: ReviewSeverity;
  file: string;
  line: number;
  title: string;
  evidence: string;
  recommendation: string;
  confidence: RuleConfidence;
}
export interface InlineSuppressionRecord {
  file: string;
  line: number;
  ruleId: string;
  type: "file" | "line" | "next-line";
  reason?: string | undefined;
}

export interface CodeReviewReport {
  root: string;
  generatedAt: string;
  scope: "changed-files" | "source-files";
  base: string;
  filesReviewed: string[];
  findings: ReviewFinding[];
  inlineSuppressions?: InlineSuppressionRecord[];
  summary: { high: number; medium: number; low: number };
  warnings: string[];
}
const SOURCE = /\.(?:[cm]?[jt]sx?)$/i;
const SKIP = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next", ".forge"]);
async function walk(dir: string, root: string, out: string[], depth = 0): Promise<void> {
  if (depth > 12) return;
  const { readdir } = await import("node:fs/promises");
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".") continue;
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, root, out, depth + 1);
    else if (entry.isFile() && SOURCE.test(entry.name)) out.push(path.relative(root, full).split(path.sep).join("/"));
  }
}
function parseSuppressionComment(raw: string): { rules: Set<string>; reason?: string | undefined } {
  const trimmed = raw
    .trim()
    .replace(/\*\/.*$/, "")
    .trim();

  let rulesPart = trimmed;
  let reason: string | undefined;

  const doubleDashIdx = trimmed.indexOf("--");
  const colonIdx = trimmed.indexOf(":");

  let splitIdx = -1;
  let delimiterLength = 0;
  if (doubleDashIdx !== -1 && (colonIdx === -1 || doubleDashIdx < colonIdx)) {
    splitIdx = doubleDashIdx;
    delimiterLength = 2;
  } else if (colonIdx !== -1) {
    splitIdx = colonIdx;
    delimiterLength = 1;
  }

  if (splitIdx !== -1) {
    rulesPart = trimmed.slice(0, splitIdx).trim();
    const candidateReason = trimmed.slice(splitIdx + delimiterLength).trim();
    if (candidateReason.length > 0) {
      reason = candidateReason;
    }
  }

  const rules = new Set<string>();
  for (const r of rulesPart.split(/[,\s]+/)) {
    const cleaned = r.trim().toUpperCase();
    if (cleaned && /^[A-Z0-9_\-]+$/.test(cleaned)) {
      rules.add(cleaned);
    }
  }
  return { rules, reason };
}

function inspectLines(
  file: string,
  source: string
): { findings: ReviewFinding[]; suppressions: InlineSuppressionRecord[] } {
  const findings: ReviewFinding[] = [];
  const suppressions: InlineSuppressionRecord[] = [];
  const lines = source.split(/\r?\n/);

  // Check for file-level suppression
  let fileDisabled = new Set<string>();
  let fileDisabledReason: string | undefined;
  const fileDisableMatch = source.match(/(?:\/\/|\/\*)\s*anvil-disable-file\s+([^\r\n]+)/i);
  if (fileDisableMatch && fileDisableMatch[1]) {
    const parsed = parseSuppressionComment(fileDisableMatch[1]);
    fileDisabled = parsed.rules;
    fileDisabledReason = parsed.reason;
  }

  interface ReviewRuleDef {
    id: string;
    severity: ReviewSeverity;
    title: string;
    pattern: RegExp;
    recommendation: string;
    baseConfidence: RuleConfidence;
  }

  const rules: ReviewRuleDef[] = [
    {
      id: "ANVIL-R001",
      severity: "high",
      title: "Dynamic code evaluation",
      pattern: /\beval\s*\(|\bnew\s+Function\s*\(/,
      recommendation: "Avoid evaluating generated strings. Prefer explicit parsers or allow-listed operations.",
      baseConfidence: "high",
    },
    {
      id: "ANVIL-R002",
      severity: "medium",
      title: "Shell execution API usage",
      // `.exec(` alone is usually RegExp.prototype.exec, so only count it on child_process-like receivers.
      pattern:
        /(?:^|[^\w$])(?:execSync|execFile|execFileSync|spawn|spawnSync)\s*\(|(?:^|[^.\w$])exec\s*\(|\b(?:cp|child_process|childProcess|childprocess|shell|shelljs)\.exec\s*\(/,
      recommendation:
        "Review argument handling, executable allow-lists, and whether shell mode is enabled. Prefer argument arrays and avoid shell interpolation.",
      baseConfidence: "medium",
    },
    {
      id: "ANVIL-R003",
      severity: "medium",
      title: "HTML injection sink",
      pattern: /\.(?:innerHTML|outerHTML)\s*=/,
      recommendation: "Avoid assigning untrusted strings to HTML sinks. Use textContent or a vetted sanitizer.",
      baseConfidence: "medium",
    },
    {
      id: "ANVIL-R004",
      severity: "low",
      title: "TypeScript error suppression",
      pattern: /@ts-ignore\b/,
      recommendation: "Prefer @ts-expect-error with an explanation, or correct the underlying type mismatch.",
      baseConfidence: "high",
    },
    {
      id: "ANVIL-R005",
      severity: "low",
      title: "Potentially empty catch block",
      pattern: /catch\s*(?:\([^)]*\))?\s*\{\s*\}/,
      recommendation: "Handle, report, or deliberately document the error instead of silently discarding it.",
      baseConfidence: "medium",
    },
    {
      id: "ANVIL-R006",
      severity: "medium",
      title: "Dangerously injected HTML property",
      pattern: /dangerouslySetInnerHTML/, // anvil-disable-line ANVIL-R006 -- this is the rule definition itself
      recommendation: "Ensure content is trusted or sanitized immediately before rendering.",
      baseConfidence: "high",
    },
  ];

  function calculateConfidence(ruleId: string, baseConfidence: RuleConfidence, lineStr: string): RuleConfidence {
    const trimmed = lineStr.trim();
    // Demote to low confidence if the match appears within string literals or documentation comments
    const isStringContext = /(?:["'`]).*?(?:eval\s*\(|new\s+Function|innerHTML|outerHTML|exec|spawn).*?(?:["'`])/.test(
      trimmed
    );

    if (isStringContext) {
      return "low";
    }

    if (ruleId === "ANVIL-R001") {
      if (/(?:^|[^\w$.])(?:eval\s*\([^)]*|new\s+Function\s*\()/.test(trimmed)) {
        return "high";
      }
      return "low";
    }

    if (ruleId === "ANVIL-R003") {
      if (/[a-zA-Z0-9_$)\]]\s*\.(?:innerHTML|outerHTML)\s*=/.test(trimmed)) {
        return "medium";
      }
      return "low";
    }

    if (ruleId === "ANVIL-R002") {
      if (/shell\s*:\s*true|\$\{|\+\s*[a-zA-Z]/.test(trimmed)) {
        return "high";
      }
      // The rule's own advice: an argument array, or an explicit shell: false, is the safe form.
      if (
        /shell\s*:\s*false/.test(trimmed) ||
        /(?:exec|execSync|execFile|execFileSync|spawn|spawnSync)\s*\(\s*(?:"[^"]*"|'[^']*'|[\w$.]+)\s*,\s*\[/.test(
          trimmed
        )
      ) {
        return "low";
      }
      return "medium";
    }

    return baseConfidence;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^\s*(?:\/\/|\*|\*)/.test(line)) continue;

    // Check line-level suppression comments
    const prevLine = i > 0 ? (lines[i - 1] ?? "") : "";
    const nextLineMatch = prevLine.match(/(?:\/\/|\/\*)\s*anvil-disable-next-line\s+([^\r\n]+)/i);
    const sameLineMatch = line.match(/(?:\/\/|\/\*)\s*anvil-disable-line\s+([^\r\n]+)/i);

    const lineDisabled = new Set<string>();
    let lineDisabledReason: string | undefined;
    let suppressionType: "line" | "next-line" | undefined;
    if (nextLineMatch && nextLineMatch[1]) {
      suppressionType = "next-line";
      const parsed = parseSuppressionComment(nextLineMatch[1]);
      for (const r of parsed.rules) lineDisabled.add(r);
      if (parsed.reason) lineDisabledReason = parsed.reason;
    }
    if (sameLineMatch && sameLineMatch[1]) {
      suppressionType = suppressionType ? "line" : "line";
      const parsed = parseSuppressionComment(sameLineMatch[1]);
      for (const r of parsed.rules) lineDisabled.add(r);
      if (parsed.reason) {
        lineDisabledReason = lineDisabledReason ? `${lineDisabledReason}; ${parsed.reason}` : parsed.reason;
      }
    }

    for (const rule of rules) {
      const ruleUpper = rule.id.toUpperCase();
      if (rule.pattern.test(line)) {
        if (fileDisabled.has("ALL") || fileDisabled.has(ruleUpper)) {
          suppressions.push({
            file,
            line: i + 1,
            ruleId: rule.id,
            type: "file",
            reason: fileDisabledReason,
          });
          continue;
        }

        if (lineDisabled.has("ALL") || lineDisabled.has(ruleUpper)) {
          suppressions.push({
            file,
            line: i + 1,
            ruleId: rule.id,
            type: suppressionType ?? "line",
            reason: lineDisabledReason,
          });
          continue;
        }

        findings.push({
          ruleId: rule.id,
          severity: rule.severity,
          file,
          line: i + 1,
          title: rule.title,
          evidence: line.trim().slice(0, 240),
          recommendation: rule.recommendation,
          confidence: calculateConfidence(rule.id, rule.baseConfidence, line),
        });
      }
    }
  }
  return { findings, suppressions };
}
export async function reviewProject(
  inputPath: string,
  options: { base?: string; all?: boolean } = {}
): Promise<CodeReviewReport> {
  const root = path.resolve(inputPath);
  const warnings: string[] = [];
  let files: string[] = [];
  let scope: CodeReviewReport["scope"] = "changed-files";
  const base = options.base ?? "HEAD";
  if (options.all) {
    scope = "source-files";
    await walk(root, root, files);
  } else {
    const git = await analyzeGitChanges(root, base);
    files = git.changes.filter((c) => c.status !== "D" && SOURCE.test(c.file)).map((c) => c.file);
    if (!files.length) {
      warnings.push("No changed source files found. Use --all to review the source tree.");
    }
  }
  files = [...new Set(files)].sort();
  const findings: ReviewFinding[] = [];
  const suppressions: InlineSuppressionRecord[] = [];
  for (const file of files) {
    try {
      const full = path.resolve(root, file);
      if (!full.startsWith(root + path.sep)) continue;
      const source = await readFile(full, "utf8");
      const inspected = inspectLines(file, source);
      findings.push(...inspected.findings);
      suppressions.push(...inspected.suppressions);
    } catch {
      warnings.push("Could not read " + file + ".");
    }
  }
  const summary = {
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
  };
  return {
    root,
    generatedAt: new Date().toISOString(),
    scope,
    base,
    filesReviewed: files,
    findings,
    inlineSuppressions: suppressions,
    summary,
    warnings,
  };
}
export function formatCodeReview(report: CodeReviewReport): string {
  return [
    "# ANVIL Code Review",
    "",
    "- Scope: " + report.scope,
    "- Files reviewed: " + report.filesReviewed.length,
    "- Findings: " +
      report.findings.length +
      " (high " +
      report.summary.high +
      ", medium " +
      report.summary.medium +
      ", low " +
      report.summary.low +
      ")",
    "",
    "## Findings",
    ...(report.findings.length
      ? report.findings.map(
          (f) =>
            "- **" +
            f.severity.toUpperCase() +
            " " +
            f.ruleId +
            "** — `" +
            f.file +
            ":" +
            f.line +
            "`: " +
            f.title +
            "\n  Evidence: `" +
            f.evidence +
            "`\n  Recommendation: " +
            f.recommendation
        )
      : ["- No configured heuristic patterns detected."]),
    "",
    "## Files reviewed",
    ...(report.filesReviewed.length ? report.filesReviewed.map((f) => "- `" + f + "`") : ["- None."]),
    "",
    "## Method and limitations",
    "- This is deterministic pattern-based triage, not an AI review, compiler analysis, or security audit.",
    "- Findings are heuristic candidates and may be false positives; absence of findings does not prove correctness or safety.",
    "- Review scope defaults to changed, non-deleted source files relative to the selected Git base. Use --all to scan the source tree.",
    ...report.warnings.map((w) => "- " + w),
  ].join("\n");
}
