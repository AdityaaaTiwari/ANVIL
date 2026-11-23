import path from "node:path";
import { approveReviewPatch } from "../core/patch-approval.js";

export async function runPatchApprove(_command: string, rest: string[]): Promise<void> {
  const pathIndex = rest.indexOf("--path");
  const reviewerIndex = rest.indexOf("--reviewer");
  const reasonIndex = rest.indexOf("--reason");
  const target = path.resolve(pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : ".");
  const values = rest.filter(
    (arg, index) =>
      !arg.startsWith("--") && index !== pathIndex + 1 && index !== reviewerIndex + 1 && index !== reasonIndex + 1
  );
  const reviewId = values[0] ?? "";
  const suggestionNumber = Number(values[1]);
  const reviewer = reviewerIndex >= 0 ? (rest[reviewerIndex + 1] ?? "") : "";
  const reason = reasonIndex >= 0 ? rest[reasonIndex + 1] : undefined;
  try {
    if (!reviewId || !Number.isInteger(suggestionNumber) || suggestionNumber < 1 || !reviewer.trim()) {
      throw new Error(
        "Usage: anvil patch-approve REVIEW_ID SUGGESTION_NUMBER --reviewer NAME [--reason TEXT] --path PROJECT"
      );
    }
    const approval = await approveReviewPatch(target, reviewId, suggestionNumber, reviewer, reason);
    process.stdout.write(
      [
        "# ANVIL Patch Approval",
        "- Approval ID: " + approval.id,
        "- Review: " + approval.reviewId,
        "- Suggestion: " + approval.suggestionNumber,
        "- File: " + approval.file,
        "- Reviewer: " + approval.reviewer,
        "- Approved: " + approval.approvedAt,
        "- Expires: " + approval.expiresAt,
        "- Patch SHA-256: " + approval.patchSha256,
        "- Source SHA-256: " + approval.sourceSha256,
        "",
        "No source files were modified.",
      ].join("\n") + "\n"
    );
  } catch (error) {
    process.stderr.write(
      "ANVIL patch approval failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
