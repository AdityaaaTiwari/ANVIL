import path from "node:path";
import { stageApprovedPatch } from "../core/patch-application.js";

export async function runPatchStage(_command: string, rest: string[]): Promise<void> {
  const pathIndex = rest.indexOf("--path");
  const target = path.resolve(pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : ".");
  const approvalId = rest.find((arg, index) => !arg.startsWith("--") && rest[index - 1] !== "--path") ?? "";
  try {
    if (!approvalId) throw new Error("Usage: anvil patch-stage APPROVAL_ID --path PROJECT");
    const staged = await stageApprovedPatch(target, approvalId);
    process.stdout.write(
      [
        "# ANVIL Isolated Patch Stage",
        "- Stage: " + staged.id,
        "- Approval: " + staged.approvalId,
        "- File: " + staged.file,
        "- Staged copy: " + staged.stagedFile,
        "- SHA-256: " + staged.stagedSha256,
        "",
        "The original project file was not modified.",
        "No tests or commands were executed.",
      ].join("\n") + "\n"
    );
  } catch (error) {
    process.stderr.write(
      "ANVIL patch staging failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
