import path from "node:path";
import { captureIntelligenceSnapshot, formatIntelligenceComparison } from "../core/intelligence-timeline.js";

export async function runSnapshot(_command: string, rest: string[]): Promise<void> {
  const target = path.resolve(rest.find((arg) => !arg.startsWith("--")) ?? ".");
  try {
    const comparison = await captureIntelligenceSnapshot(target);
    process.stdout.write(formatIntelligenceComparison(comparison) + "\n");
  } catch (error) {
    process.stderr.write("FORGE snapshot failed: " + (error instanceof Error ? error.message : String(error)) + "\n");
    process.exitCode = 1;
  }
  return;
}
