import path from "node:path";
import { analyzeEngineeringRisk, formatEngineeringRisk } from "../core/engineering-risk.js";

export async function runRisk(_command: string, rest: string[]): Promise<void> {
  const pathIndex = rest.indexOf("--path");
  const target = path.resolve(
    pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : (rest.find((arg) => !arg.startsWith("--")) ?? ".")
  );
  const json = rest.includes("--json");
  try {
    const report = await analyzeEngineeringRisk(target);
    process.stdout.write(json ? JSON.stringify(report, null, 2) + "\n" : formatEngineeringRisk(report) + "\n");
  } catch (error) {
    process.stderr.write(
      "FORGE engineering risk analysis failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
