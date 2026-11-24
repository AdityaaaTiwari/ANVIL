import path from "node:path";
import {
  createBenchmarkTrial,
  formatBenchmark,
  listBenchmarks,
  recordBenchmarkTrial,
} from "../core/benchmark-engine.js";
import { loadEvaluationReport } from "../core/evaluation-engine.js";
import { loadExecutionTrace } from "../core/execution-trace.js";

export async function runBenchmark(_command: string, rest: string[]): Promise<void> {
  const pathIndex = rest.indexOf("--path"),
    suiteIndex = rest.indexOf("--suite");
  const runId = rest.find(
    (arg, index) => !arg.startsWith("--") && rest[index - 1] !== "--path" && rest[index - 1] !== "--suite"
  );
  const target = path.resolve(pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : ".");
  const suiteId = suiteIndex >= 0 ? rest[suiteIndex + 1] : undefined;
  try {
    if (!runId) {
      const documents = await listBenchmarks(target);
      process.stdout.write(
        documents.length
          ? documents.map((document) => formatBenchmark(document)).join("\n\n") + "\n"
          : "No benchmark history. Evaluate and record a run with: forge benchmark RUN_ID --path .\n"
      );
      return;
    }
    const report = await loadEvaluationReport(target, runId, suiteId);
    const trace = await loadExecutionTrace(target, runId);
    const document = await recordBenchmarkTrial(target, createBenchmarkTrial(report, trace));
    process.stdout.write(formatBenchmark(document) + "\n");
  } catch (error) {
    process.stderr.write("ANVIL benchmark failed: " + (error instanceof Error ? error.message : String(error)) + "\n");
    process.exitCode = 1;
  }
  return;
}
