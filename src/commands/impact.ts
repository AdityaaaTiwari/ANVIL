import path from "node:path";
import { analyzeDependencyImpact, formatDependencyImpact } from "../core/dependency-impact.js";

export async function runImpact(_command: string, rest: string[]): Promise<void> {
  const pathIndex = rest.indexOf("--path"),
    baseIndex = rest.indexOf("--base");
  const target = path.resolve(
    pathIndex >= 0
      ? (rest[pathIndex + 1] ?? ".")
      : (rest.find((arg, index) => !arg.startsWith("--") && rest[index - 1] !== "--base") ?? ".")
  );
  const base = baseIndex >= 0 ? (rest[baseIndex + 1] ?? "HEAD") : "HEAD";
  const json = rest.includes("--json");
  try {
    const report = await analyzeDependencyImpact(target, base);
    process.stdout.write(json ? JSON.stringify(report, null, 2) + "\n" : formatDependencyImpact(report) + "\n");
  } catch (error) {
    process.stderr.write(
      "ANVIL dependency impact analysis failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
