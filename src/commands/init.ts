import { initializeProject } from "../core/project-init.js";
import path from "node:path";

export async function runInit(_command: string, rest: string[]): Promise<void> {
  const target = rest.find((arg) => !arg.startsWith("--")) ?? ".";
  try {
    const result = await initializeProject(path.resolve(target));
    process.stdout.write(`ANVIL initialized in ${path.resolve(target)}\n`);
    for (const file of result.created) process.stdout.write(`  created  ${file}\n`);
    for (const file of result.skipped) process.stdout.write(`  kept     ${file} (already exists)\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`ANVIL could not initialize this project: ${message}\n`);
    process.exitCode = 1;
  }
  return;
}
