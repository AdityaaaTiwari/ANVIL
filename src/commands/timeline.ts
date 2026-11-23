import path from "node:path";
import { compareLatestIntelligence, formatIntelligenceComparison } from "../core/intelligence-timeline.js";

export async function runTimeline(_command: string, rest: string[]): Promise<void> {
  const target = path.resolve(rest.find((arg) => !arg.startsWith("--")) ?? ".");
  try {
    const comparison = await compareLatestIntelligence(target);
    process.stdout.write(
      comparison
        ? formatIntelligenceComparison(comparison) + "\n"
        : "No engineering snapshots found. Run forge snapshot . first.\n"
    );
  } catch (error) {
    process.stderr.write("FORGE timeline failed: " + (error instanceof Error ? error.message : String(error)) + "\n");
    process.exitCode = 1;
  }
  return;
}
