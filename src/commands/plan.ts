import path from "node:path";
import { createReviewPlan } from "../core/review-planner.js";
import { saveRun } from "../core/run-store.js";

export async function runPlan(_command: string, rest: string[]): Promise<void> {
  const goalIndex = rest.indexOf("--goal");
  const pathIndex = rest.indexOf("--path");
  const goalEnd = pathIndex >= 0 ? pathIndex : rest.length;
  const goal =
    goalIndex >= 0
      ? rest
          .slice(goalIndex + 1, goalEnd)
          .join(" ")
          .trim()
      : "";
  const target = path.resolve(pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : ".");
  try {
    const plan = createReviewPlan(goal);
    const saved = await saveRun(target, plan);
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    process.stdout.write(
      `\nDraft plan saved to ${path.relative(target, saved)}. No AI provider was called and no files or commands were executed.\n`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`ANVIL could not create a plan: ${message}\n`);
    process.exitCode = 1;
  }
  return;
}
