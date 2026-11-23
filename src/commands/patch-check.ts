import path from "node:path";
import { loadReview } from "../core/review-history.js";
import { formatPatchValidation, validateReviewPatch } from "../core/patch-validation.js";

export async function runPatchCheck(_command: string, rest: string[]): Promise<void> {
  const id = rest.find((arg, index) => !arg.startsWith("--") && rest[index - 1] !== "--path") ?? "";
  const pathIndex = rest.indexOf("--path");
  const target = path.resolve(pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : ".");
  const numberArg = rest.find(
    (arg, index) => index > 0 && !arg.startsWith("--") && rest[index - 1] !== id && rest[index - 1] !== "--path"
  );
  try {
    if (!id || !numberArg) throw new Error("Usage: anvil patch-check REVIEW_ID SUGGESTION_NUMBER --path PROJECT");
    const record = await loadReview(target, id);
    const result = await validateReviewPatch(target, record, Number(numberArg));
    process.stdout.write(formatPatchValidation(result) + "\n");
    if (result.status !== "applicable") process.exitCode = 1;
  } catch (error) {
    process.stderr.write(
      "ANVIL patch validation failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
