import path from "node:path";

export async function runDoctor(_command: string, rest: string[]): Promise<void> {
  if (rest.includes("--help")) {
    process.stdout.write(
      "Usage: anvil doctor [path] [--fix] [--json]\n" +
        "  Run environment health checks.\n" +
        "  Add --fix to auto-scaffold missing .anvil config directories, .gitignore, and .env.example.\n"
    );
    return;
  }
  const json = rest.includes("--json");
  const doFix = rest.includes("--fix");
  const target = rest.find((arg) => !arg.startsWith("--"));
  try {
    const { runDoctorChecks, fixDoctorIssues, formatDoctorReport } = await import("../core/doctor.js");
    if (doFix) {
      const fixResult = await fixDoctorIssues(target ? path.resolve(target) : undefined);
      if (!json) {
        process.stdout.write("# ANVIL Doctor Auto-Fix\n\n");
        if (fixResult.repaired.length > 0) {
          for (const item of fixResult.repaired) {
            process.stdout.write(`✓ ${item}\n`);
          }
        } else {
          process.stdout.write("✓ Environment and configuration are already properly set up.\n");
        }
        if (fixResult.warnings.length > 0) {
          for (const warn of fixResult.warnings) {
            process.stdout.write(`! Warning: ${warn}\n`);
          }
        }
        process.stdout.write("\nRunning health checks after fix...\n\n");
      }
    }
    const report = await runDoctorChecks(target ? path.resolve(target) : undefined);
    process.stdout.write(json ? JSON.stringify(report, null, 2) + "\n" : formatDoctorReport(report) + "\n");
    if (report.overallStatus === "critical") process.exitCode = 1;
  } catch (error) {
    process.stderr.write("ANVIL doctor failed: " + (error instanceof Error ? error.message : String(error)) + "\n");
    process.exitCode = 1;
  }
  return;
}
