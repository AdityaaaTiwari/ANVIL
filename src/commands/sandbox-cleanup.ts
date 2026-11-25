import {
  formatSandboxCleanupReport,
  parseManagedContainers,
  selectStoppedManagedContainers,
} from "../core/sandbox-lifecycle.js";
import { appendSandboxCleanupAudit } from "../core/sandbox-cleanup-audit.js";
import { runSandboxProbe } from "./shared.js";

export async function runSandboxCleanup(_command: string, rest: string[]): Promise<void> {
  const apply = rest.includes("--apply");
  const unknown = rest.filter((arg) => arg !== "--apply");
  try {
    if (unknown.length)
      throw new Error("Usage: anvil sandbox-cleanup [--apply]. Cleanup is dry-run unless --apply is explicit.");
    const output = await runSandboxProbe([
      "ps",
      "-a",
      "--filter",
      "label=com.anvil.managed=true",
      "--format",
      "{{.ID}}\\t{{.Status}}\\t{{.Names}}",
    ]);
    const managed = parseManagedContainers(output);
    const candidates = selectStoppedManagedContainers(managed);
    const removed: string[] = [];
    if (apply) {
      for (const container of candidates) {
        await runSandboxProbe(["rm", container.id]);
        removed.push(container.id);
      }
    }
    await appendSandboxCleanupAudit(process.cwd(), {
      id: "cleanup-" + Date.now().toString(36),
      timestamp: new Date().toISOString(),
      mode: apply ? "apply" : "dry-run",
      candidates: candidates.map(({ id, name, status }) => ({ id, name, status })),
      removed,
    });
    process.stdout.write(formatSandboxCleanupReport(candidates, removed, apply) + "\n");
  } catch (error) {
    process.stderr.write(
      "ANVIL sandbox cleanup failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
