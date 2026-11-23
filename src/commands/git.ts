import path from "node:path";
import { analyzeGitChanges, formatGitIntelligence } from "../core/git-intelligence.js";

export async function runGit(_command: string, rest: string[]): Promise<void> {
  const json = rest.includes("--json");
  const pathIndex = rest.indexOf("--path");
  const baseIndex = rest.indexOf("--base");
  const target = path.resolve(
    pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : (rest.find((arg) => !arg.startsWith("--")) ?? ".")
  );
  const base = baseIndex >= 0 ? (rest[baseIndex + 1] ?? "HEAD") : "HEAD";
  try {
    const report = await analyzeGitChanges(target, base);
    process.stdout.write(json ? JSON.stringify(report, null, 2) + "\n" : formatGitIntelligence(report) + "\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`ANVIL Git analysis failed: ${message}\n`);
    process.exitCode = 1;
  }
  return;
}
