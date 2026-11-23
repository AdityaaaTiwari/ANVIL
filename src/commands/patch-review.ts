import path from "node:path";
import { reviewStagedPatch } from "../core/patch-application.js";

export async function runPatchReview(_command: string, rest: string[]): Promise<void> {
  const pathIndex = rest.indexOf("--path");
  const target = path.resolve(pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : ".");
  const stageId = rest.find((arg, index) => !arg.startsWith("--") && rest[index - 1] !== "--path") ?? "";
  try {
    if (!stageId) throw new Error("Usage: anvil patch-review STAGE_ID --path PROJECT");
    const review = await reviewStagedPatch(target, stageId);
    process.stdout.write(
      [
        "# ANVIL Staged Patch Review",
        "- Stage: " + review.stageId,
        "- File: " + review.file,
        "- Source SHA-256: " + review.sourceSha256,
        "- Staged SHA-256: " + review.stagedSha256,
        "- Source unchanged: " + review.unchanged,
        "",
        review.diff,
      ].join("\n") + "\n"
    );
  } catch (error) {
    process.stderr.write(
      "ANVIL staged patch review failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
