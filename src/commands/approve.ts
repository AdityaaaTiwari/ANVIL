import path from "node:path";
import { decideTaskApproval } from "../core/run-store.js";

export async function runApprove(_command: string, rest: string[]): Promise<void> {
  const runId = rest[0] ?? "";
  const taskId = rest[1] ?? "";
  const pathIndex = rest.indexOf("--path");
  const target = path.resolve(pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : ".");
  const reviewerIndex = rest.indexOf("--reviewer");
  const reasonIndex = rest.indexOf("--reason");
  try {
    if (!runId || !taskId)
      throw new Error("Usage: anvil approve RUN_ID TASK_ID [--reviewer NAME] [--reason TEXT] [--path PROJECT]");
    const updated = await decideTaskApproval(
      target,
      runId,
      taskId,
      "approved",
      reviewerIndex >= 0 ? (rest[reviewerIndex + 1] ?? "local-user") : "local-user",
      reasonIndex >= 0 ? rest.slice(reasonIndex + 1, pathIndex >= 0 ? pathIndex : rest.length).join(" ") : undefined
    );
    process.stdout.write(
      "Approved " + taskId + " in " + runId + ". Resume explicitly with `forge resume " + runId + "`.\n"
    );
    process.stdout.write("Run status: " + updated.status + "\n");
  } catch (error) {
    process.stderr.write("Could not approve task: " + (error instanceof Error ? error.message : String(error)) + "\n");
    process.exitCode = 1;
  }
  return;
}
