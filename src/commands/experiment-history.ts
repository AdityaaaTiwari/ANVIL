import path from "node:path";
import { listBenchmarkMatrices } from "../core/benchmark-matrix.js";
import { buildExperimentHistory, formatExperimentHistory } from "../core/experiment-history.js";

export async function runExperimentHistory(_command: string, rest: string[]): Promise<void> {
  const option = (name: string) => {
    const index = rest.indexOf(name);
    return index >= 0 ? rest[index + 1] : undefined;
  };
  const pathIndex = rest.indexOf("--path");
  const target = path.resolve(pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : ".");
  const rawLimit = option("--limit");
  const limit = rawLimit === undefined ? undefined : Number(rawLimit);
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)) {
    process.stderr.write("ANVIL experiment history: --limit must be an integer from 1 to 100.\n");
    process.exitCode = 1;
    return;
  }
  try {
    const suiteId = option("--suite");
    const candidateId = option("--candidate");
    const reports = await listBenchmarkMatrices(target);
    const history = buildExperimentHistory(reports, {
      ...(suiteId ? { suiteId } : {}),
      ...(candidateId ? { candidateId } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
    process.stdout.write(
      rest.includes("--json") ? JSON.stringify(history, null, 2) + "\n" : formatExperimentHistory(history) + "\n"
    );
  } catch (error) {
    process.stderr.write(
      "ANVIL experiment history failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
