import path from "node:path";
import { applySecurityFixes, formatSecurityReport, scanProjectSecurity } from "../core/security-scanner.js";

export async function runSecurity(_command: string, rest: string[]): Promise<void> {
  if (rest.includes("--help") || rest.includes("-h") || rest[0] === "help") {
    process.stdout.write(`Usage: anvil security [path] [options]

Deep scan repository for hardcoded secrets, exposed tokens, sensitive files, and dangerous script patterns.

Options:
  --fix        Auto-remediate exposed credentials by updating .gitignore
  --json       Output report in machine-readable JSON format
  --help       Show this help message
`);
    return;
  }
  const isJson = rest.includes("--json");
  const shouldFix = rest.includes("--fix");
  const positional = rest.filter((arg) => !arg.startsWith("--"));
  const target = path.resolve(positional[0] ?? ".");
  try {
    const report = await scanProjectSecurity(target);
    if (shouldFix && report.findings.length > 0) {
      const fixResult = await applySecurityFixes(target, report.findings);
      if (fixResult.fixedCount > 0) {
        process.stdout.write(
          `Applied ${fixResult.fixedCount} security fix(es):\n` +
            fixResult.details.map((d) => `  ✓ ${d}`).join("\n") +
            "\n\n"
        );
      }
    }
    if (isJson) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    } else {
      process.stdout.write(formatSecurityReport(report));
    }
    if (!report.passed) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(
      "ANVIL security audit failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
