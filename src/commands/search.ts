import path from "node:path";
import { searchWorkspace } from "../core/code-search.js";

export async function runSearch(_command: string, rest: string[]): Promise<void> {
  const pathIndex = rest.indexOf("--path"),
    limitIndex = rest.indexOf("--limit");
  const optionValues = new Set<number>();
  if (pathIndex >= 0) optionValues.add(pathIndex + 1);
  if (limitIndex >= 0) optionValues.add(limitIndex + 1);
  const target = path.resolve(pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : ".");
  const query = rest
    .filter((arg, index) => !arg.startsWith("--") && !optionValues.has(index))
    .join(" ")
    .trim();
  const limit = limitIndex >= 0 ? Number(rest[limitIndex + 1]) : 80;
  try {
    const report = await searchWorkspace(target, query, limit);
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } catch (error) {
    process.stderr.write(
      "ANVIL code search failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
