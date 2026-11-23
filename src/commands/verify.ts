import path from "node:path";
import { discoverChecks, formatVerificationResult, runVerification } from "../core/verification.js";
import { compareVerification, formatVerificationComparison, saveVerification } from "../core/verification-history.js";

export async function runVerify(command: string, rest: string[]): Promise<void> {
  const listOnly = rest.includes("--list");
  const pathIndex = rest.indexOf("--path");
  const target = path.resolve(pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : ".");
  const script = rest.find((arg) => !arg.startsWith("--"));
  try {
    if (listOnly) {
      const checks = await discoverChecks(target);
      process.stdout.write(
        checks.length
          ? checks.map((check) => `${check.name.padEnd(20)} ${check.command}`).join("\n") + "\n"
          : "No selectable npm scripts found.\n"
      );
      return;
    }
    if (!script)
      throw new Error(
        "Choose one script explicitly. Usage: anvil verify SCRIPT [--path PROJECT], or use --list to discover scripts."
      );
    const result = await runVerification(target, script);
    const comparison = await compareVerification(target, result);
    await saveVerification(target, result);
    process.stdout.write(`${formatVerificationResult(result)}\n\n${formatVerificationComparison(comparison)}\n`);
    process.stdout.write(
      `\nSaved verification history: ${path.relative(target, path.join(target, ".forge", "verifications", result.id + ".json"))}\n`
    );
    if (result.status !== "passed") process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`ANVIL verification failed: ${message}\n`);
    process.exitCode = 1;
  }
  return;
}
