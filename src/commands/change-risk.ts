import path from "node:path";
import { analyzeChangeIntelligence, formatChangeIntelligence } from "../core/change-intelligence.js";

export async function runChangeRisk(_command: string, rest: string[]): Promise<void> {
  const pathIndex = rest.indexOf("--path"),
    baseIndex = rest.indexOf("--base");
  const target = path.resolve(
    pathIndex >= 0
      ? (rest[pathIndex + 1] ?? ".")
      : (rest.find((arg, index) => !arg.startsWith("--") && rest[index - 1] !== "--base") ?? ".")
  );
  const base = baseIndex >= 0 ? (rest[baseIndex + 1] ?? "HEAD") : "HEAD";
  const json = rest.includes("--json");
  try {
    const report = await analyzeChangeIntelligence(target, base);
    process.stdout.write(json ? JSON.stringify(report, null, 2) + "\n" : formatChangeIntelligence(report) + "\n");
  } catch (error) {
    process.stderr.write(
      "FORGE change-risk analysis failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
