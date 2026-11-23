import path from "node:path";
import { loadHooks } from "../core/hook-engine.js";

export async function runHook(_command: string, rest: string[]): Promise<void> {
  if (rest[0] === "install" || rest.includes("--install")) {
    const force = rest.includes("--force") || rest.includes("-f");
    const target = path.resolve(
      rest.find((arg) => !arg.startsWith("--") && arg !== "install" && arg !== "pre-commit") ?? "."
    );
    try {
      const { installPrecommitHook } = await import("../core/project-cleaner.js");
      const result = await installPrecommitHook(target, { force });
      process.stdout.write(`${result.detail}\n`);
      if (!result.success) process.exitCode = 1;
    } catch (error) {
      process.stderr.write(
        "Could not install hook: " + (error instanceof Error ? error.message : String(error)) + "\n"
      );
      process.exitCode = 1;
    }
    return;
  }
  if (rest[0] === "remove" || rest[0] === "uninstall" || rest.includes("--remove") || rest.includes("--uninstall")) {
    const target = path.resolve(
      rest.find((arg) => !arg.startsWith("--") && arg !== "remove" && arg !== "uninstall" && arg !== "pre-commit") ??
        "."
    );
    try {
      const { uninstallPrecommitHook } = await import("../core/project-cleaner.js");
      const result = await uninstallPrecommitHook(target);
      process.stdout.write(`${result.detail}\n`);
      if (!result.success) process.exitCode = 1;
    } catch (error) {
      process.stderr.write("Could not remove hook: " + (error instanceof Error ? error.message : String(error)) + "\n");
      process.exitCode = 1;
    }
    return;
  }
  const target = path.resolve(rest.find((arg) => !arg.startsWith("--")) ?? ".");
  try {
    const hooks = await loadHooks(target);
    process.stdout.write(
      hooks.length
        ? hooks.map((hook) => hook.id + " [" + hook.event + "] " + hook.action + ": " + hook.message).join("\n") + "\n"
        : "No lifecycle hooks configured.\n"
    );
  } catch (error) {
    process.stderr.write("Could not load hooks: " + (error instanceof Error ? error.message : String(error)) + "\n");
    process.exitCode = 1;
  }
  return;
}
