import { formatHarnessCapabilities } from "../core/harness-capabilities.js";

export async function runHarnesses(_command: string, args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write("Usage: anvil harnesses\n");
    return;
  }
  process.stdout.write(formatHarnessCapabilities() + "\n");
}
