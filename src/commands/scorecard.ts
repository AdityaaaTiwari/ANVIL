import path from "node:path";
import { buildScorecard, formatScorecard, formatScorecardMarkdown } from "../core/harness-scorecard.js";

export async function runScorecard(_command: string, args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write("Usage: anvil scorecard [path] [--min PERCENT] [--json] [--markdown] [--verbose]\n");
    return;
  }
  const projectPath = path.resolve(args.find((a) => !a.startsWith("-")) ?? ".");
  const isJson = args.includes("--json");
  const isMarkdown = args.includes("--markdown");
  const isVerbose = args.includes("--verbose");
  const minIndex = args.indexOf("--min");
  const minPercent = minIndex !== -1 && args[minIndex + 1] ? Number(args[minIndex + 1]) : undefined;

  const card = await buildScorecard({ projectPath, forgeVersion: "4.0.0" });
  if (isJson) {
    process.stdout.write(JSON.stringify(card, null, 2) + "\n");
  } else if (isMarkdown) {
    process.stdout.write(formatScorecardMarkdown(card) + "\n");
  } else {
    process.stdout.write(formatScorecard(card, { verbose: isVerbose }) + "\n");
  }

  if (minPercent !== undefined && Number.isFinite(minPercent)) {
    if (card.percent < minPercent) {
      process.exitCode = 4;
    }
  }
}
