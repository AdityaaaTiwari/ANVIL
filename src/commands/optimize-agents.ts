import path from "node:path";
import { listBenchmarkMatrices } from "../core/benchmark-matrix.js";
import { buildAgentOptimizationPlan, formatAgentOptimizationPlan } from "../core/agent-optimization.js";

export async function runOptimizeAgents(_command: string, rest: string[]): Promise<void> {
  const pathIndex = rest.indexOf("--path");
  const target = path.resolve(pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : ".");
  try {
    const matrices = await listBenchmarkMatrices(target);
    const plan = buildAgentOptimizationPlan(matrices);
    process.stdout.write(formatAgentOptimizationPlan(plan) + "\n");
    if (plan.status === "insufficient-history") process.exitCode = 2;
  } catch (error) {
    process.stderr.write(
      "ANVIL adaptive agent optimization failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
