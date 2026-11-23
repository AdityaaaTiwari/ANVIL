import path from "node:path";
import { formatReviewRecord, loadReview } from "../core/review-history.js";

export async function runReviewShow(_command: string, rest: string[]): Promise<void> {
  const id = rest.find((arg) => !arg.startsWith("--")) ?? "";
  const pathIndex = rest.indexOf("--path");
  const target = path.resolve(pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : ".");
  try {
    const record = await loadReview(target, id);
    process.stdout.write(formatReviewRecord(record) + "\n");
  } catch (error) {
    process.stderr.write(
      "ANVIL could not load review: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
