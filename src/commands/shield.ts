import path from "node:path";
import {
  applyShieldFixes,
  formatShieldMarkdown,
  formatShieldReport,
  runShield,
  toSarif,
} from "../core/forge-shield.js";

export async function runShieldCommand(_command: string, args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write("Usage: anvil shield [path] [--fix] [--json] [--sarif] [--markdown]\n");
    return;
  }
  const projectPath = path.resolve(args.find((a) => !a.startsWith("-")) ?? ".");
  const isJson = args.includes("--json");
  const isSarif = args.includes("--sarif");
  const isMarkdown = args.includes("--markdown");
  const isFix = args.includes("--fix");

  const report = await runShield(projectPath);
  if (isFix) {
    const fixed = await applyShieldFixes(projectPath, report);
    process.stdout.write(`Applied ${fixed.length} shield fix(es).\n`);
    return;
  }

  if (isJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else if (isSarif) {
    process.stdout.write(JSON.stringify(toSarif(report, "4.0.0"), null, 2) + "\n");
  } else if (isMarkdown) {
    process.stdout.write(formatShieldMarkdown(report) + "\n");
  } else {
    process.stdout.write(formatShieldReport(report) + "\n");
  }

  if (report.findings.length > 0) {
    process.exitCode = 1;
  }
}
