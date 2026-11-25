import path from "node:path";
import { formatSandboxCleanupHistory, readSandboxCleanupAudit } from "../core/sandbox-cleanup-audit.js";

export async function runSandboxCleanupHistory(_command: string, rest: string[]): Promise<void> {
  const target = path.resolve(rest[0] ?? ".");
  try {
    process.stdout.write(formatSandboxCleanupHistory(await readSandboxCleanupAudit(target)) + "\n");
  } catch (error) {
    process.stderr.write(
      "ANVIL sandbox cleanup history failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
