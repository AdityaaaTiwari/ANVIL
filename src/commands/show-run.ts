import { loadRun } from "../core/run-store.js";
import path from "node:path";

export async function runShowRun(_command: string, rest: string[]): Promise<void> {
  if (rest.includes("--help")) {
    process.stdout.write("Usage: anvil show-run RUN_ID [--path PROJECT]\nDisplays one validated saved run record.\n");
    return;
  }
  const pathIndices = rest.flatMap((arg, index) => (arg === "--path" ? [index] : []));
  const pathIndex = pathIndices[0] ?? -1;
  const pathValue = pathIndex >= 0 ? rest[pathIndex + 1] : undefined;
  const positional = rest.filter((arg, index) => !arg.startsWith("--") && !(pathIndex >= 0 && index === pathIndex + 1));
  const target = pathValue ?? ".";
  try {
    if (pathIndices.length > 1) throw new Error("--path may only be specified once.");
    if (rest.some((arg) => arg.startsWith("--") && arg !== "--path")) {
      throw new Error(`Unknown option: ${rest.find((arg) => arg.startsWith("--") && arg !== "--path")}.`);
    }
    if (pathIndex >= 0 && (!pathValue || pathValue.startsWith("--"))) {
      throw new Error("--path requires a project directory.");
    }
    if (positional.length !== 1) throw new Error("Usage: anvil show-run RUN_ID [--path PROJECT]");
    const id = positional[0]!;
    const run = await loadRun(path.resolve(target), id);
    process.stdout.write(`${JSON.stringify(run, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Could not load run: ${message}\n`);
    process.exitCode = 1;
  }
  return;
}
