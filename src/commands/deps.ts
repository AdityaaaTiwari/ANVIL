import path from "node:path";
import { analyzeDependencies, formatDependencyIntelligence } from "../core/dependency-intelligence.js";

export async function runDeps(_command: string, rest: string[]): Promise<void> {
  if (rest.includes("--help")) {
    process.stdout.write("Usage: anvil deps [path] [--audit-report FILE] [--outdated-report FILE] [--json]\n");
    return;
  }
  const option = (name: string) => {
    const index = rest.indexOf(name);
    return index >= 0 ? rest[index + 1] : undefined;
  };
  const target = path.resolve(
    rest.find(
      (arg, index) =>
        !arg.startsWith("--") && rest[index - 1] !== "--audit-report" && rest[index - 1] !== "--outdated-report"
    ) ?? "."
  );
  try {
    const auditReport = option("--audit-report"),
      outdatedReport = option("--outdated-report");
    const report = await analyzeDependencies(target, {
      ...(auditReport ? { auditReport } : {}),
      ...(outdatedReport ? { outdatedReport } : {}),
    });
    process.stdout.write(
      rest.includes("--json") ? JSON.stringify(report, null, 2) + "\n" : formatDependencyIntelligence(report) + "\n"
    );
  } catch (error) {
    process.stderr.write(
      "FORGE dependency analysis failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
