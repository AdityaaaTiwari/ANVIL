import path from "node:path";
import { analyzeContext, formatContextReport } from "../core/context-budget.js";
import { findPositionalArgs } from "./shared.js";

const VALUE_FLAGS = new Set(["--path"]);

export async function runContext(_command: string, args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write("Usage: anvil context [path] [--verbose] [--json]\n");
    return;
  }
  const positional = findPositionalArgs(args, VALUE_FLAGS);
  const pathIdx = args.indexOf("--path");
  const projectPath = path.resolve(pathIdx !== -1 && args[pathIdx + 1] ? args[pathIdx + 1]! : (positional[0] ?? "."));
  const isJson = args.includes("--json");
  const isVerbose = args.includes("--verbose");

  const report = await analyzeContext(projectPath);
  if (isJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    process.stdout.write(formatContextReport(report, { verbose: isVerbose }) + "\n");
  }
}
