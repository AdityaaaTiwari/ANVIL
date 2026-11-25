import path from "node:path";
import { evaluateGate, generateBaselineJson } from "../core/policy-engine.js";
import { mkdir, writeFile } from "node:fs/promises";
import { generateSarif } from "../core/sarif-formatter.js";

export async function runGate(_command: string, rest: string[]): Promise<void> {
  if (rest.includes("--help") || rest.includes("-h") || rest[0] === "help") {
    process.stdout.write(`Usage: anvil gate [path] [options]

Deterministic CI quality & security gate. Evaluates repository health, security secrets,
and code quality rules against policies. Emits human-readable reports, machine-readable JSON,
or OASIS SARIF v2.1.0 for PR comments and GitHub Security tab integration.

Options:
  --sarif PATH              Export findings to an OASIS SARIF v2.1.0 report file
  --policy PATH             Custom JSON policy file (defaults to .anvil/policy.json if present)
  --policy-ref REF          Read baseline policy file from git ref (e.g. origin/main, HEAD~1)
  --baseline PATH           Baseline JSON file to suppress known existing findings
  --generate-baseline PATH  Export current findings as a baseline JSON file
  --since REF               Evaluate only files modified since git revision (e.g. origin/main, HEAD~1)
  --diff                    Evaluate only modified files in current working tree relative to HEAD
  --min-confidence LEVEL    Minimum rule confidence to block gate (high, medium, low; default: medium)
  --import-sarif PATH       Import external SARIF v2.1.0 report (e.g. Semgrep, CodeQL, Snyk)
  --skip-agent-config       Don't scan AI-agent configs (AGENTS.md, Claude hooks, MCP configs)
  --fail-on-warnings        Fail gate (exit 1) on medium-severity warnings as well as critical/high errors
  --json                    Output full gate evaluation in machine-readable JSON format
  --help                    Show this help message

Exit codes:
  0  Gate passed: all policy thresholds and security checks satisfied.
  1  Gate failed: critical/high vulnerabilities or policy violations detected.
`);
    return;
  }
  const option = (name: string) => {
    const index = rest.indexOf(name);
    if (index < 0) return undefined;
    const next = rest[index + 1];
    return next && !next.startsWith("--") ? next : undefined;
  };
  const isJson = rest.includes("--json");
  const failOnWarnings = rest.includes("--fail-on-warnings");
  const diffOnly = rest.includes("--diff");
  const sarifPath = option("--sarif");
  const policyPath = option("--policy");
  const policyRef = option("--policy-ref");
  const baselinePath = option("--baseline");
  const generateBaselinePath = option("--generate-baseline");
  const since = option("--since");
  const minConfidence = option("--min-confidence") as "high" | "medium" | "low" | undefined;
  const externalSarifPaths: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--import-sarif" && rest[i + 1] && !rest[i + 1]!.startsWith("--")) {
      externalSarifPaths.push(rest[i + 1]!);
    }
  }
  const positional = rest.filter(
    (arg, index) =>
      !arg.startsWith("--") &&
      arg !== sarifPath &&
      arg !== policyPath &&
      arg !== policyRef &&
      arg !== baselinePath &&
      arg !== generateBaselinePath &&
      arg !== since &&
      arg !== minConfidence &&
      rest[index - 1] !== "--import-sarif"
  );
  const target = path.resolve(positional[0] ?? ".");
  try {
    const evaluation = await evaluateGate(target, {
      policyPath,
      policyRef,
      baselinePath,
      failOnWarnings,
      since,
      diffOnly,
      minConfidence,
      externalSarifPaths: externalSarifPaths.length > 0 ? externalSarifPaths : undefined,
      skipAgentConfig: rest.includes("--skip-agent-config"),
    });

    if (generateBaselinePath) {
      const outResolved = path.resolve(generateBaselinePath);
      await mkdir(path.dirname(outResolved), { recursive: true });
      await writeFile(outResolved, generateBaselineJson(evaluation.activeFindings), "utf8");
      if (!isJson) {
        process.stdout.write(
          `Generated baseline with ${evaluation.activeFindings.length} findings to ${path.relative(process.cwd(), outResolved)}\n`
        );
      }
    }

    if (sarifPath) {
      const sarifOutput = generateSarif({
        activeFindings: evaluation.activeFindings,
        suppressedFindings: evaluation.suppressedFindings,
        inlineSuppressions: evaluation.inlineSuppressions,
        filterSuppressed: true,
        targetRoot: target,
      });
      const outResolved = path.resolve(sarifPath);
      await mkdir(path.dirname(outResolved), { recursive: true });
      await writeFile(outResolved, sarifOutput, "utf8");
      if (!isJson) {
        process.stdout.write(`Exported SARIF report to ${path.relative(process.cwd(), outResolved)}\n`);
      }
    }

    if (isJson) {
      process.stdout.write(
        JSON.stringify(
          {
            gate: evaluation.passed ? "PASSED" : "FAILED",
            target,
            policySource: evaluation.policySource,
            baselineSource: evaluation.baselineSource,
            violations: evaluation.violations,
            warnings: evaluation.warnings,
            summary: evaluation.summary,
            activeFindings: evaluation.activeFindings,
            suppressedFindings: evaluation.suppressedFindings,
            inlineSuppressions: evaluation.inlineSuppressions,
          },
          null,
          2
        ) + "\n"
      );
    } else {
      const lines = [
        `# ANVIL CI Quality & Security Gate`,
        `Target: ${target}`,
        `Status: ${evaluation.passed ? "PASSED" : "FAILED"}`,
        `Policy: ${evaluation.policySource}`,
      ];
      if (evaluation.baselineSource) {
        lines.push(
          `Baseline: ${evaluation.baselineSource} (${evaluation.summary.suppressedByBaseline} findings suppressed)`
        );
      }
      if (evaluation.diffBase) {
        lines.push(
          `Diff Scope: relative to ${evaluation.diffBase} (${evaluation.summary.suppressedByDiff ?? 0} findings outside diff)`
        );
      }
      lines.push(
        ``,
        `Findings Summary:`,
        `  Critical: ${evaluation.summary.critical}`,
        `  High:     ${evaluation.summary.high}`,
        `  Medium:   ${evaluation.summary.medium}`,
        `  Low:      ${evaluation.summary.low}`
      );
      if (evaluation.summary.suppressedByBaseline > 0) {
        lines.push(`  Suppressed by baseline: ${evaluation.summary.suppressedByBaseline}`);
      }
      if (evaluation.summary.suppressedByDiff && evaluation.summary.suppressedByDiff > 0) {
        lines.push(`  Suppressed by diff:     ${evaluation.summary.suppressedByDiff}`);
      }
      if (evaluation.summary.inlineSuppressions > 0) {
        lines.push(`  Inline suppressions:   ${evaluation.summary.inlineSuppressions}`);
      }
      if (evaluation.summary.advisoryLowConfidence && evaluation.summary.advisoryLowConfidence > 0) {
        lines.push(`  Advisory (low confidence): ${evaluation.summary.advisoryLowConfidence}`);
      }
      lines.push(``);
      if (evaluation.warnings && evaluation.warnings.length > 0) {
        lines.push(`Advisory Notices:`);
        for (const w of evaluation.warnings) {
          lines.push(`  ⚠ ${w}`);
        }
        lines.push(``);
      }
      if (evaluation.violations.length > 0) {
        lines.push(`Policy Violations:`);
        for (const v of evaluation.violations) {
          lines.push(`  ✗ ${v}`);
        }
        lines.push(``);
      }
      lines.push(
        evaluation.passed
          ? `✓ Gate passed: all policy thresholds satisfied.`
          : `✗ Gate failed: ${evaluation.violations.length} policy violations detected.`
      );
      process.stdout.write(lines.join("\n") + "\n");
    }

    if (!evaluation.passed) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write("ANVIL gate check failed: " + (error instanceof Error ? error.message : String(error)) + "\n");
    process.exitCode = 1;
  }
  return;
}
