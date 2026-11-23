import path from "node:path";
import { compareReviews, loadReview } from "../core/review-history.js";

export async function runReviewCompare(_command: string, rest: string[]): Promise<void> {
  const ids = rest.filter((arg, index) => !arg.startsWith("--") && rest[index - 1] !== "--path");
  const pathIndex = rest.indexOf("--path");
  const target = path.resolve(pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : ".");
  try {
    if (ids.length < 2) throw new Error("Usage: anvil review-compare REVIEW_ID_A REVIEW_ID_B --path PROJECT");
    const [a, b] = await Promise.all([loadReview(target, ids[0]!), loadReview(target, ids[1]!)]);
    const diff = compareReviews(a, b);
    process.stdout.write(
      [
        "Review comparison",
        "Added (" + diff.added.length + ")",
        ...diff.added.map((x) => "+ " + x),
        "Resolved (" + diff.resolved.length + ")",
        ...diff.resolved.map((x) => "- " + x),
        "Persistent (" + diff.persistent.length + ")",
        ...diff.persistent.map((x) => "= " + x),
      ].join("\n") + "\n"
    );
  } catch (error) {
    process.stderr.write(
      "ANVIL review comparison failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
