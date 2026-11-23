import path from "node:path";
import { loadRun, saveRun } from "../core/run-store.js";
import { createReplayRun } from "../core/run-replay.js";

export async function runReplay(_command: string, rest: string[]): Promise<void> {
  const runId = rest[0] ?? "";
  const pathIndex = rest.indexOf("--path");
  const target = path.resolve(pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : ".");
  try {
    if (!runId) throw new Error("Usage: anvil replay RUN_ID [--path PROJECT]");
    const source = await loadRun(target, runId);
    const replay = createReplayRun(source);
    const saved = await saveRun(target, replay);
    process.stdout.write("Created replay " + replay.id + " from " + runId + ".\n");
    process.stdout.write("Saved: " + path.relative(target, saved) + "\n");
    process.stdout.write(
      "Run `forge resume " + replay.id + " --path " + target + "` when ready to call the configured provider.\n"
    );
  } catch (error) {
    process.stderr.write("Could not create replay: " + (error instanceof Error ? error.message : String(error)) + "\n");
    process.exitCode = 1;
  }
  return;
}
