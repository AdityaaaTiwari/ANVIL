import path from "node:path";
import { forgeStatus, formatStatus } from "../core/forge-status.js";
import { renderStatusLine } from "../core/statusline.js";

export async function runStatus(command: string, args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write("Usage: anvil status [path] [--json]\n       anvil statusline [path]\n");
    return;
  }
  const projectPath = path.resolve(args.find((a) => !a.startsWith("-")) ?? ".");
  if (command === "statusline") {
    const line = await renderStatusLine("", projectPath);
    process.stdout.write(line + "\n");
    return;
  }

  const isJson = args.includes("--json");
  const report = await forgeStatus(projectPath, "4.0.0");
  if (isJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    process.stdout.write(formatStatus(report) + "\n");
  }
}
