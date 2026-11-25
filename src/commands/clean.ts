import path from "node:path";

export async function runClean(command: string, rest: string[]): Promise<void> {
  if (rest.includes("--help")) {
    process.stdout.write(
      `Usage: anvil ${command} [path] [--apply] [--fix] [--json]\n  Clean workspace junk clutter, downloads, logs, and auto-repair code issues.\n`
    );
    return;
  }
  const json = rest.includes("--json");
  const isFix = command === "fix";
  const apply = isFix || rest.includes("--apply");
  const fix = isFix || rest.includes("--fix");
  const verify = rest.includes("--verify");
  const checkOrphans = !rest.includes("--no-orphans");
  const target = rest.find((arg) => !arg.startsWith("--")) ?? ".";
  try {
    const { cleanProject, formatCleanReport } = await import("../core/project-cleaner.js");
    const report = await cleanProject(path.resolve(target), { apply, fix, checkOrphans, verify });
    process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : `${formatCleanReport(report)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`ANVIL ${command} failed: ${message}\n`);
    process.exitCode = 1;
  }
  return;
}
