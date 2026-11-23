import path from "node:path";
import { listBenchmarkMatrices } from "../core/benchmark-matrix.js";
import { assessAgentEvolution, formatAgentEvolutionAssessment } from "../core/agent-evolution.js";

export async function runAgentEvolution(_command: string, rest: string[]): Promise<void> {
  const matrixId = rest[0];
  const pathIndex = rest.indexOf("--path");
  const target = path.resolve(pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : ".");
  if (!matrixId || matrixId.startsWith("--")) {
    process.stderr.write("Usage: anvil agent-evolution MATRIX_ID --path PROJECT\n");
    process.exitCode = 1;
    return;
  }
  try {
    const history = await listBenchmarkMatrices(target);
    const report = history
      .filter((item) => item.matrixId === matrixId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!report) throw new Error("Benchmark matrix not found: " + matrixId);
    const assessment = assessAgentEvolution(report);
    process.stdout.write(formatAgentEvolutionAssessment(assessment) + "\n");
    if (assessment.status !== "eligible-for-review")
      process.exitCode = assessment.status === "insufficient-evidence" ? 2 : 1;
  } catch (error) {
    process.stderr.write(
      "ANVIL agent evolution failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
