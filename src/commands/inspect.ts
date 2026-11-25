import { formatProjectReport, inspectProject } from "../core/project-inspector.js";
import path from "node:path";
import { formatArchitectureMap, mapArchitecture } from "../core/architecture-map.js";

export async function runInspect(command: string, rest: string[]): Promise<void> {
  if (rest.includes("--help")) {
    process.stdout.write(`Usage: anvil ${command} [path] [--json]\n`);
    return;
  }
  const json = rest.includes("--json");
  const target = rest.find((arg) => !arg.startsWith("--")) ?? ".";
  try {
    if (command === "inspect") {
      const report = await inspectProject(path.resolve(target));
      process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : `${formatProjectReport(report)}\n`);
    } else {
      const report = await mapArchitecture(path.resolve(target));
      process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : `${formatArchitectureMap(report)}\n`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`ANVIL could not ${command} this project: ${message}\n`);
    process.exitCode = 1;
  }
  return;
}
