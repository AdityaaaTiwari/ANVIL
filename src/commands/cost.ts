import path from "node:path";
import { buildCostReport, formatCostReport } from "../core/session-cost.js";
import { findPositionalArgs } from "./shared.js";

const VALUE_FLAGS = new Set(["--path"]);

export async function runCost(_command: string, args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write("Usage: anvil cost [path] [--json]\n");
    return;
  }
  const positional = findPositionalArgs(args, VALUE_FLAGS);
  const pathIdx = args.indexOf("--path");
  const projectPath = path.resolve(pathIdx !== -1 && args[pathIdx + 1] ? args[pathIdx + 1]! : (positional[0] ?? "."));
  const isJson = args.includes("--json");
  const report = await buildCostReport(projectPath);
  if (isJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    process.stdout.write(formatCostReport(report) + "\n");
  }
}
