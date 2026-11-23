// Helpers shared by several CLI commands.
import { spawn } from "node:child_process";
import { getAnvilEnv } from "../core/env-compat.js";

export function runSandboxProbe(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(output);
    };
    const append = (chunk: Buffer | string) => {
      if (output.length < 4096) output += chunk.toString().slice(0, 4096 - output.length);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.once("error", (error) => finish(error));
    child.once("close", (code) =>
      code === 0 ? finish() : finish(new Error("Docker probe exited with status " + code + "."))
    );
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(new Error("Docker probe timed out after 15 seconds."));
    }, 15_000);
  });
}

export function readAgentTokenBudgets(): Record<string, number> | undefined {
  const raw = getAnvilEnv("ANVIL_MAX_ESTIMATED_TOKENS_PER_AGENT", "FORGE_MAX_ESTIMATED_TOKENS_PER_AGENT");
  if (!raw) return undefined;
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("ANVIL_MAX_ESTIMATED_TOKENS_PER_AGENT must be a JSON object mapping agent IDs to token limits.");
  const budgets: Record<string, number> = {};
  for (const [agent, value] of Object.entries(parsed)) {
    if (!agent.trim() || !Number.isSafeInteger(value) || (value as number) < 1)
      throw new Error("Every per-agent token budget must be a positive integer.");
    budgets[agent] = value as number;
  }
  return budgets;
}

export function readAgentDurationBudgets(): Record<string, number> | undefined {
  const raw = getAnvilEnv("ANVIL_MAX_TASK_DURATION_MS_BY_AGENT", "FORGE_MAX_TASK_DURATION_MS_BY_AGENT");
  if (!raw) return undefined;
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("ANVIL_MAX_TASK_DURATION_MS_BY_AGENT must be a JSON object mapping agent IDs to milliseconds.");
  const budgets: Record<string, number> = {};
  for (const [agent, value] of Object.entries(parsed)) {
    if (!agent.trim() || !Number.isSafeInteger(value) || (value as number) < 1)
      throw new Error("Every per-agent duration budget must be a positive integer number of milliseconds.");
    budgets[agent] = value as number;
  }
  return budgets;
}
