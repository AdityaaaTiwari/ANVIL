import path from "node:path";
import { evaluateGate } from "../core/policy-engine.js";
import {
  decideHook,
  HOOK_HARNESSES,
  hookOutput,
  hookWorkspace,
  parseHookInput,
  type HookHarness,
} from "../core/agent-hooks.js";

const USAGE = `Usage: anvil hook stop --harness ${HOOK_HARNESSES.join("|")} [path]

Called by an AI coding tool when its agent finishes. Reads the tool's hook
JSON on stdin, runs \`anvil gate --diff\` on the project, and, if the gate
fails, answers in that tool's format so the agent keeps going and fixes the
findings. Installed by \`anvil install --hooks\`; you don't normally run it
yourself.

It never traps the agent: it lets the agent stop after one follow-up (Claude
Code) or two (Cursor), and if ANVIL itself fails it lets the agent stop.`;

function readStdin(timeoutMs: number): Promise<string> {
  if (process.stdin.isTTY) return Promise.resolve("");
  return new Promise((resolve) => {
    let data = "";
    const done = () => {
      clearTimeout(timer);
      process.stdin.removeAllListeners();
      process.stdin.pause();
      resolve(data);
    };
    const timer = setTimeout(done, timeoutMs);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => {
      if (data.length < 1_000_000) data += chunk;
    });
    process.stdin.on("end", done);
    process.stdin.on("error", done);
  });
}

export async function runAgentStopHook(rest: string[]): Promise<void> {
  const [event, ...args] = rest;
  if (!event || event === "--help" || args.includes("--help")) {
    process.stdout.write(USAGE + "\n");
    return;
  }
  if (event !== "stop") {
    process.stderr.write(`Unknown hook event "${event}". Supported: stop.\n`);
    process.exitCode = 1;
    return;
  }
  const harnessIndex = args.indexOf("--harness");
  const harness = (harnessIndex >= 0 ? args[harnessIndex + 1] : undefined) as HookHarness | undefined;
  if (!harness || !HOOK_HARNESSES.includes(harness)) {
    process.stderr.write(`--harness must be one of: ${HOOK_HARNESSES.join(", ")}.\n`);
    process.exitCode = 1;
    return;
  }
  const positional = args.filter((arg, i) => !arg.startsWith("--") && i !== harnessIndex + 1);
  const input = parseHookInput(await readStdin(5_000));
  const decision = decideHook(harness, input);
  if (!decision.runGate) {
    process.stderr.write(`ANVIL: not checking (${decision.skipReason}).\n`);
    process.stdout.write(hookOutput(harness, undefined));
    return;
  }
  const workspace = path.resolve(positional[0] ?? hookWorkspace(input, process.cwd()));
  try {
    const evaluation = await evaluateGate(workspace, { diffOnly: true });
    process.stderr.write(`ANVIL gate on changed files: ${evaluation.passed ? "PASSED" : "FAILED"}\n`);
    process.stdout.write(hookOutput(harness, evaluation));
  } catch (error) {
    // Never block the agent because ANVIL itself broke.
    process.stderr.write(
      `ANVIL hook could not run the gate: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.stdout.write(hookOutput(harness, undefined));
  }
}
