import path from "node:path";
import { formatProjectHealthMarkdown, generateProjectHealth } from "../core/project-health.js";

export async function runHealth(_command: string, rest: string[]): Promise<void> {
  const json = rest.includes("--json");
  const target = path.resolve(rest.find((arg) => !arg.startsWith("--")) ?? ".");
  try {
    const report = await generateProjectHealth(target);
    process.stdout.write(json ? JSON.stringify(report, null, 2) + "\n" : formatProjectHealthMarkdown(report) + "\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`ANVIL health report failed: ${message}\n`);
    process.exitCode = 1;
  }
  return;
}
