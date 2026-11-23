import path from "node:path";
import { loadExecutionTrace } from "../core/execution-trace.js";

export async function runTrace(_command: string, rest: string[]): Promise<void> {
  const runId = rest[0];
  const pathIndex = rest.indexOf("--path");
  const target = path.resolve(pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : ".");
  if (!runId) {
    process.stderr.write("Usage: anvil trace RUNID [--path PROJECT]\n");
    process.exitCode = 1;
    return;
  }
  try {
    const trace = await loadExecutionTrace(target, runId);
    process.stdout.write("FORGE execution trace: " + runId + "\n");
    for (const entry of trace.entries)
      process.stdout.write(
        "  " +
          entry.taskId +
          " [" +
          entry.tier +
          "] " +
          entry.model +
          " | " +
          entry.durationMs +
          " ms | " +
          entry.outcome +
          " | ~" +
          entry.inputTokensEstimate +
          "/" +
          entry.outputTokensEstimate +
          " tokens\n"
      );
    process.stdout.write(
      "Totals: " +
        trace.totals.tasks +
        " tasks, " +
        trace.totals.estimatedInputTokens +
        " input tokens, " +
        trace.totals.estimatedOutputTokens +
        " output tokens, " +
        trace.totals.fallbacks +
        " fallbacks, " +
        trace.totals.failures +
        " failures\n"
    );
    process.stdout.write("Provider health:\n");
    for (const provider of trace.providers ?? [])
      process.stdout.write(
        "  " +
          provider.name +
          ": " +
          provider.requests +
          " requests, " +
          provider.successes +
          " successes, " +
          provider.fallbacks +
          " fallbacks, " +
          provider.failures +
          " failures, " +
          provider.retries +
          " retries, " +
          provider.durationMs +
          " ms\n"
      );
  } catch (error) {
    process.stderr.write(
      "Could not read execution trace: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
