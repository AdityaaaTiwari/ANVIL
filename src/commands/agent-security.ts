import path from "node:path";
import { auditAgentConfiguration, formatAgentSecurityReport } from "../core/agent-security-audit.js";

export async function runAgentSecurity(_command: string, rest: string[]): Promise<void> {
  const target = path.resolve(rest.find((arg) => !arg.startsWith("--")) ?? ".");
  try {
    const report = await auditAgentConfiguration(target);
    process.stdout.write(
      rest.includes("--json") ? JSON.stringify(report, null, 2) + "\n" : formatAgentSecurityReport(report) + "\n"
    );
    if (report.summary.critical > 0) process.exitCode = 2;
  } catch (error) {
    process.stderr.write(
      "FORGE agent security audit failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
