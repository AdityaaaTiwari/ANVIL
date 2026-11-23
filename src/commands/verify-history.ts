import path from "node:path";
import { listVerifications } from "../core/verification-history.js";

export async function runVerifyHistory(_command: string, rest: string[]): Promise<void> {
  const targetIndex = rest.indexOf("--path");
  const target = path.resolve(targetIndex >= 0 ? (rest[targetIndex + 1] ?? ".") : ".");
  try {
    const history = await listVerifications(target);
    if (!history.length) {
      process.stdout.write("No saved verification runs.\n");
      return;
    }
    process.stdout.write(
      history
        .map(
          (item) =>
            `${item.startedAt}  ${item.status.padEnd(12)} ${item.script.padEnd(16)} ${item.durationMs} ms  ${item.id}`
        )
        .join("\n") + "\n"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Could not load verification history: ${message}\n`);
    process.exitCode = 1;
  }
  return;
}
