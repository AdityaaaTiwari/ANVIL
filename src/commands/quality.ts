import { auditProject, formatQualityAudit } from "../core/quality-audit.js";
import path from "node:path";

export async function runQuality(_command: string, rest: string[]): Promise<void> {
  if (rest.includes("--help")) {
    process.stdout.write("Usage: anvil quality [path] [--json]\n");
    return;
  }
  const json = rest.includes("--json");
  const target = rest.find((arg) => !arg.startsWith("--")) ?? ".";
  try {
    const report = await auditProject(path.resolve(target));
    process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : `${formatQualityAudit(report)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`ANVIL quality audit failed: ${message}\n`);
    process.exitCode = 1;
  }
  return;
}
