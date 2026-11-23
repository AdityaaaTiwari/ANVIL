import { formatSandboxRuntimeReport, parseSandboxRuntimeReport } from "../core/sandbox-runtime.js";
import { runSandboxProbe } from "./shared.js";

export async function runSandboxStatus(_command: string, rest: string[]): Promise<void> {
  const runtime = "docker";
  try {
    const [version, security] = await Promise.all([
      runSandboxProbe(["--version"]),
      runSandboxProbe(["info", "--format", "{{json .SecurityOptions}}"]),
    ]);
    const report = parseSandboxRuntimeReport(runtime, version, security);
    process.stdout.write(formatSandboxRuntimeReport(report) + "\n");
  } catch (error) {
    const report = parseSandboxRuntimeReport(runtime, "", "");
    report.warnings.push(error instanceof Error ? error.message : String(error));
    process.stdout.write(formatSandboxRuntimeReport(report) + "\n");
    process.exitCode = 1;
  }
  return;
}
