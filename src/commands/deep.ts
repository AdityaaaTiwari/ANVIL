import path from "node:path";
import { analyzeCodebase, formatCodebaseAnalysis } from "../core/code-intelligence.js";

export async function runDeep(_command: string, rest: string[]): Promise<void> {
  const json = rest.includes("--json");
  const target = path.resolve(rest.find((arg) => !arg.startsWith("--")) ?? ".");
  try {
    const report = await analyzeCodebase(target);
    process.stdout.write(json ? JSON.stringify(report, null, 2) + "\n" : formatCodebaseAnalysis(report) + "\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`ANVIL deep analysis failed: ${message}\n`);
    process.exitCode = 1;
  }
  return;
}
