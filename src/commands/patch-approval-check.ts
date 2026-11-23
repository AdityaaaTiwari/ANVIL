import path from "node:path";
import { verifyPatchApproval } from "../core/patch-approval.js";

export async function runPatchApprovalCheck(_command: string, rest: string[]): Promise<void> {
  const id = rest.find((arg, index) => !arg.startsWith("--") && rest[index - 1] !== "--path") ?? "";
  const pathIndex = rest.indexOf("--path");
  const target = path.resolve(pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : ".");
  try {
    if (!id) throw new Error("Usage: anvil patch-approval-check APPROVAL_ID --path PROJECT");
    const result = await verifyPatchApproval(target, id);
    process.stdout.write((result.valid ? "VALID: " : "INVALID: ") + result.reason + "\n");
    if (!result.valid) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(
      "FORGE patch approval check failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
