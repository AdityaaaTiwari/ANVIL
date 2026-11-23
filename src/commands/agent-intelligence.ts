import path from "node:path";
import { listBenchmarkMatrices } from "../core/benchmark-matrix.js";
import {
  buildAgentEvaluationIntelligence,
  formatAgentEvaluationIntelligence,
} from "../core/agent-evaluation-intelligence.js";

export async function runAgentIntelligence(_command: string, rest: string[]): Promise<void> {
  if (rest.includes("--help")) {
    process.stdout.write(
      "Usage: anvil agent-intelligence [--suite ID] [--candidate ID] [--limit N] [--json] [--path PROJECT]\n" +
        "Score agent effectiveness across benchmark history.\n\n" +
        "Options:\n" +
        "  --suite ID       Filter to a specific evaluation suite ID.\n" +
        "  --candidate ID   Filter to a specific candidate ID.\n" +
        "  --limit N        Number of historical runs to analyze (2–50, default 10).\n" +
        "  --json           Output the full intelligence report as machine-readable JSON.\n" +
        "  --path PROJECT   Path to the ANVIL project directory (defaults to cwd).\n\n" +
        "Exit codes:\n" +
        "  0  Ready: at least one scorecard was produced.\n" +
        "  1  Error: an unexpected failure occurred.\n" +
        "  2  Insufficient data: not enough benchmark history to generate scorecards.\n"
    );
    return;
  }
  const option = (name: string) => {
    const index = rest.indexOf(name);
    if (index < 0) return undefined;
    const next = rest[index + 1];
    return next && !next.startsWith("--") ? next : undefined;
  };
  const pathIndex = rest.indexOf("--path");
  const target = path.resolve(pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : ".");
  const rawLimit = option("--limit");
  const limit = rawLimit === undefined ? undefined : Number(rawLimit);
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 2 || limit > 50)) {
    process.stderr.write("ANVIL agent intelligence: --limit must be an integer from 2 to 50.\n");
    process.exitCode = 1;
    return;
  }
  try {
    const history = await listBenchmarkMatrices(target);
    const suiteId = option("--suite");
    const candidateId = option("--candidate");
    const report = buildAgentEvaluationIntelligence(history, {
      ...(suiteId ? { suiteId } : {}),
      ...(candidateId ? { candidateId } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
    process.stdout.write(
      rest.includes("--json")
        ? JSON.stringify(report, null, 2) + "\n"
        : formatAgentEvaluationIntelligence(report) + "\n"
    );
    if (report.status === "insufficient-data") process.exitCode = 2;
  } catch (error) {
    process.stderr.write(
      "ANVIL agent intelligence failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
