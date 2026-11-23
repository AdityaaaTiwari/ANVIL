import path from "node:path";
import { formatRegressionReport, generateRegressionReport } from "../core/regression-intelligence.js";

export async function runRegression(_command: string, rest: string[]): Promise<void> {
  const pathIndex = rest.indexOf("--path");
  const baseIndex = rest.indexOf("--base");
  const target = path.resolve(
    pathIndex >= 0
      ? (rest[pathIndex + 1] ?? ".")
      : (rest.find((arg, index) => !arg.startsWith("--") && rest[index - 1] !== "--base") ?? ".")
  );
  const base = baseIndex >= 0 ? (rest[baseIndex + 1] ?? "HEAD") : "HEAD";
  const json = rest.includes("--json");
  try {
    const report = await generateRegressionReport(target, base);
    process.stdout.write(json ? JSON.stringify(report, null, 2) + "\n" : formatRegressionReport(report) + "\n");
    if (report.summary.regressions > 0) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(
      "ANVIL regression analysis failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
