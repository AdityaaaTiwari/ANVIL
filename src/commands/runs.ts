import { listRuns } from "../core/run-store.js";
import path from "node:path";
import { formatRunHistoryJson } from "../core/run-history-output.js";

export async function runRuns(_command: string, rest: string[]): Promise<void> {
  if (rest.includes("--help")) {
    process.stdout.write(
      "Usage: anvil runs [path] [--json] [--limit N] [--status STATUS]\nLists valid saved run records. Use --json for the versioned machine-readable summary, --limit N for the newest N runs, and --status to filter by run state.\n"
    );
    return;
  }
  const limitIndex = rest.indexOf("--limit");
  const statusIndex = rest.indexOf("--status");
  const rawLimit = limitIndex >= 0 ? rest[limitIndex + 1] : undefined;
  const rawStatus = statusIndex >= 0 ? rest[statusIndex + 1] : undefined;
  const limit = limitIndex < 0 ? undefined : Number(rawLimit);
  const positionalPaths = rest.filter(
    (arg, index) =>
      !arg.startsWith("--") &&
      !(limitIndex >= 0 && index === limitIndex + 1) &&
      !(statusIndex >= 0 && index === statusIndex + 1)
  );
  const target = positionalPaths[0] ?? ".";
  try {
    if (positionalPaths.length > 1) {
      throw new Error("Usage: anvil runs [path] [--json] [--limit N] [--status STATUS]");
    }
    for (const option of ["--json", "--limit", "--status"]) {
      if (rest.filter((arg) => arg === option).length > 1) {
        throw new Error(`${option} may only be specified once.`);
      }
    }
    const allowedOptions = new Set(["--json", "--limit", "--status"]);
    const unknownOption = rest.find((arg) => arg.startsWith("--") && !allowedOptions.has(arg));
    if (unknownOption) throw new Error(`Unknown option: ${unknownOption}.`);
    if (limitIndex >= 0 && (!rawLimit || rawLimit.startsWith("--") || !Number.isSafeInteger(limit) || limit! < 1)) {
      throw new Error("--limit requires a positive safe integer.");
    }
    const validStatuses = ["pending", "awaiting_approval", "running", "completed", "failed", "cancelled"] as const;
    if (
      statusIndex >= 0 &&
      (!rawStatus || rawStatus.startsWith("--") || !validStatuses.includes(rawStatus as (typeof validStatuses)[number]))
    ) {
      throw new Error(`--status requires one of: ${validStatuses.join(", ")}.`);
    }
    const allRuns = await listRuns(path.resolve(target));
    const filteredRuns = rawStatus ? allRuns.filter((run) => run.status === rawStatus) : allRuns;
    const runs = limit === undefined ? filteredRuns : filteredRuns.slice(0, limit);
    if (rest.includes("--json")) {
      process.stdout.write(formatRunHistoryJson(runs));
    } else {
      process.stdout.write(
        runs.length
          ? runs.map((run) => `${run.id}  ${run.status.padEnd(18)} ${run.goal}`).join("\n") + "\n"
          : "No saved ANVIL runs.\n"
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Could not list run history: ${message}\n`);
    process.exitCode = 1;
  }
  return;
}
