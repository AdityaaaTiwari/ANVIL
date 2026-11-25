import path from "node:path";
import { buildScorecard, formatScorecard, formatScorecardMarkdown } from "../core/harness-scorecard.js";
import { findPositionalArgs, resolvePackageVersion } from "./shared.js";

const VALUE_FLAGS = new Set(["--min", "--path"]);

export async function runScorecard(_command: string, args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write("Usage: anvil scorecard [path] [--min PERCENT] [--json] [--markdown] [--verbose]\n");
    return;
  }
  const positional = findPositionalArgs(args, VALUE_FLAGS);
  const pathIdx = args.indexOf("--path");
  const projectPath = path.resolve(pathIdx !== -1 && args[pathIdx + 1] ? args[pathIdx + 1]! : (positional[0] ?? "."));
  const isJson = args.includes("--json");
  const isMarkdown = args.includes("--markdown");
  const isVerbose = args.includes("--verbose");
  const minIndex = args.indexOf("--min");
  const minPercent = minIndex !== -1 && args[minIndex + 1] ? Number(args[minIndex + 1]) : undefined;

  const card = await buildScorecard({ projectPath, anvilVersion: resolvePackageVersion() });
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
