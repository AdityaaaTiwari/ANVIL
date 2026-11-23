import path from "node:path";

export async function runUndo(_command: string, rest: string[]): Promise<void> {
  if (rest.includes("--help")) {
    process.stdout.write(
      "Usage: anvil undo [path] [--json]\n  Rollback the last anvil clean or fix operation using saved snapshot backup.\n"
    );
    return;
  }
  const json = rest.includes("--json");
  const target = rest.find((arg) => !arg.startsWith("--")) ?? ".";
  try {
    const { undoLastClean, formatUndoReport } = await import("../core/project-cleaner.js");
    const report = await undoLastClean(path.resolve(target));
    process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : `${formatUndoReport(report)}\n`);
    if (report.errors.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`ANVIL undo failed: ${message}\n`);
    process.exitCode = 1;
  }
  return;
}
