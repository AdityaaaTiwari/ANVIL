import path from "node:path";
import { listReviews } from "../core/review-history.js";

export async function runReviewHistory(_command: string, rest: string[]): Promise<void> {
  const target = path.resolve(rest.find((arg, index) => !arg.startsWith("--") && rest[index - 1] !== "--path") ?? ".");
  try {
    const records = await listReviews(target);
    process.stdout.write(
      records.length
        ? records
            .map((r) => r.id + "  " + r.createdAt + "  " + r.report.findings.length + " static findings")
            .join("\n") + "\n"
        : "No saved reviews found.\n"
    );
  } catch (error) {
    process.stderr.write(
      "ANVIL review history failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
