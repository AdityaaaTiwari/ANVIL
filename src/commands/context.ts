import path from "node:path";
import { analyzeContext, formatContextReport } from "../core/context-budget.js";

export async function runContext(_command: string, args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write("Usage: anvil context [path] [--verbose] [--json]\n");
    return;
  }
  const projectPath = path.resolve(args.find((a) => !a.startsWith("-")) ?? ".");
  const isJson = args.includes("--json");
  const isVerbose = args.includes("--verbose");

  const report = await analyzeContext(projectPath);
  if (isJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    process.stdout.write(formatContextReport(report, { verbose: isVerbose }) + "\n");
  }
}
