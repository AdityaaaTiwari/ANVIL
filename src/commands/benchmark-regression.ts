import path from "node:path";
import { formatBenchmarkRegression, loadBenchmarkRegression } from "../core/benchmark-regression.js";

export async function runBenchmarkRegression(_command: string, rest: string[]): Promise<void> {
  const targetIndex = rest.indexOf("--path");
  const target = path.resolve(targetIndex >= 0 ? (rest[targetIndex + 1] ?? ".") : ".");
  const matrixId = rest.find((arg, index) => !arg.startsWith("--") && index === 0);
  try {
    const report = await loadBenchmarkRegression(target, matrixId);
    process.stdout.write(formatBenchmarkRegression(report) + "\n");
    if (report.status === "blocked") process.exitCode = 2;
  } catch (error) {
    process.stderr.write(
      "ANVIL benchmark regression failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
