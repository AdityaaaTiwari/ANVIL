import path from "node:path";
import { buildCostReport, formatCostReport } from "../core/session-cost.js";

export async function runCost(_command: string, args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write("Usage: anvil cost [path] [--json]\n");
    return;
  }
  const projectPath = path.resolve(args.find((a) => !a.startsWith("-")) ?? ".");
  const isJson = args.includes("--json");
  const report = await buildCostReport(projectPath);
  if (isJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    process.stdout.write(formatCostReport(report) + "\n");
  }
}
