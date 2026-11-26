import path from "node:path";
import { loadHooks } from "../core/hook-engine.js";
import { HOOK_EVENTS, runHarnessHook, type HookEventName } from "../core/harness-hooks.js";
import { NATIVE_HOOK_HARNESSES, runNativeHook, type NativeHookHarness } from "../core/hook-adapters.js";
import { readStdin, runAgentStopHook } from "./agent-stop-hook.js";

function emitHookOutput(json: Record<string, unknown> | undefined, exitCode: number): void {
  if (json !== undefined) {
    process.stdout.write(JSON.stringify(json) + "\n");
  }
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}

export async function runHook(_command: string, rest: string[]): Promise<void> {
  // Legacy stop gate adapter: `anvil hook stop --harness claude|cursor [path]`
  if (rest[0] === "stop" && rest.includes("--harness")) {
    await runAgentStopHook(rest);
    return;
  }

  // Native harness adapter protocol: `anvil hook --harness cursor|codex|gemini <EventName>`
  const harnessIdx = rest.indexOf("--harness");
  if (harnessIdx >= 0) {
    const harness = rest[harnessIdx + 1] as NativeHookHarness | undefined;
    const nativeEvent = rest.find((arg, idx) => !arg.startsWith("--") && idx !== harnessIdx + 1);
    if (harness && NATIVE_HOOK_HARNESSES.includes(harness) && nativeEvent) {
      const stdinRaw = await readStdin(5_000);
      const result = await runNativeHook(harness, nativeEvent, stdinRaw, { cwd: process.cwd() });
      emitHookOutput(result.json, result.exitCode);
      return;
    }
  }

  // Claude Code runtime hook protocol: `anvil hook <pre-tool|post-edit|stop|session-start|prompt-submit|pre-compact|session-end>`
  const eventArg = rest[0] as HookEventName | undefined;
  if (eventArg && HOOK_EVENTS.includes(eventArg)) {
    const stdinRaw = await readStdin(5_000);
    const result = await runHarnessHook(eventArg, stdinRaw, { cwd: process.cwd() });
    emitHookOutput(result.json, result.exitCode);
    return;
  }

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
