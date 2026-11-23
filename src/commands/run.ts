import path from "node:path";
import { assertSupportedAgentPolicy, loadPermissionPolicy } from "../core/permission-policy.js";
import { getAnvilEnv } from "../core/env-compat.js";
import { ClaudeCodeProvider } from "../ai/claude-code-provider.js";
import { createHostedAgentProvider } from "../core/hosted-agent-provider.js";
import { ModelRouter } from "../core/model-router.js";
import { createReviewPlan } from "../core/review-planner.js";
import { formatSkillContext, loadSkillRegistry, selectSkills } from "../core/skill-registry.js";
import { applyBeforeAgentHooks, loadHooks } from "../core/hook-engine.js";
import { buildProjectMemoryContext } from "../core/project-memory.js";
import { advanceRun } from "../core/orchestrator.js";
import { buildAgentWorkspaceContext } from "../core/agent-workspace-context.js";
import { saveRun } from "../core/run-store.js";
import { saveExecutionTrace } from "../core/execution-trace.js";
import { readAgentDurationBudgets, readAgentTokenBudgets } from "./shared.js";

export async function runRun(_command: string, rest: string[]): Promise<void> {
  const goalIndex = rest.indexOf("--goal");
  const pathIndex = rest.indexOf("--path");
  const goalEnd = pathIndex >= 0 ? pathIndex : rest.length;
  const goal =
    goalIndex >= 0
      ? rest
          .slice(goalIndex + 1, goalEnd)
          .join(" ")
          .trim()
      : "";
  const target = path.resolve(pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : ".");
  try {
    const permissions = await loadPermissionPolicy(target);
    const model = getAnvilEnv("ANVIL_AI_MODEL", "FORGE_AI_MODEL") ?? getAnvilEnv("ANVIL_MODEL", "FORGE_MODEL");
    const providerChoice = getAnvilEnv("ANVIL_AI_PROVIDER", "FORGE_AI_PROVIDER", "openai")!.toLowerCase();
    assertSupportedAgentPolicy(permissions, providerChoice, "ANVIL run");
    const baseModel = model ?? (providerChoice === "claude-code" ? "sonnet" : "gpt-4.1-mini");
    const apiKey = getAnvilEnv("ANVIL_API_KEY", "FORGE_API_KEY") ?? process.env.OPENAI_API_KEY ?? "";
    const baseUrl = getAnvilEnv("ANVIL_BASE_URL", "FORGE_BASE_URL", "https://api.openai.com/v1")!;
    const createProvider = (selectedModel: string) => {
      if (providerChoice === "claude-code") return new ClaudeCodeProvider({ cwd: target, model: selectedModel });
      if (["openai", "anthropic", "google", "ollama"].includes(providerChoice)) {
        return createHostedAgentProvider(
          { ...process.env, ANVIL_AI_PROVIDER: providerChoice, FORGE_AI_PROVIDER: providerChoice },
          selectedModel,
          { workspacePath: target, permissionPolicy: permissions }
        );
      }
      throw new Error("Unsupported ANVIL_AI_PROVIDER. Choose claude-code, openai, anthropic, google or ollama.");
    };
    const runFallback = getAnvilEnv("ANVIL_FALLBACK_MODEL", "FORGE_FALLBACK_MODEL");
    const router = new ModelRouter({
      fastModel: getAnvilEnv("ANVIL_MODEL_FAST", "FORGE_MODEL_FAST") ?? baseModel,
      balancedModel: getAnvilEnv("ANVIL_MODEL_BALANCED", "FORGE_MODEL_BALANCED") ?? baseModel,
      reasoningModel: getAnvilEnv("ANVIL_MODEL_REASONING", "FORGE_MODEL_REASONING") ?? baseModel,
      ...(runFallback ? { fallbackModel: runFallback } : {}),
      retryAttempts: Number(getAnvilEnv("ANVIL_MODEL_RETRY_ATTEMPTS", "FORGE_MODEL_RETRY_ATTEMPTS", "2")),
      retryDelayMs: Number(getAnvilEnv("ANVIL_MODEL_RETRY_DELAY_MS", "FORGE_MODEL_RETRY_DELAY_MS", "500")),
      createProvider,
      ...(getAnvilEnv("ANVIL_MAX_INPUT_TOKENS_PER_TASK", "FORGE_MAX_INPUT_TOKENS_PER_TASK")
        ? {
            maxInputTokensPerTask: Number(
              getAnvilEnv("ANVIL_MAX_INPUT_TOKENS_PER_TASK", "FORGE_MAX_INPUT_TOKENS_PER_TASK")
            ),
          }
        : {}),
      ...(getAnvilEnv("ANVIL_MAX_OUTPUT_TOKENS_PER_TASK", "FORGE_MAX_OUTPUT_TOKENS_PER_TASK")
        ? {
            maxOutputTokensPerTask: Number(
              getAnvilEnv("ANVIL_MAX_OUTPUT_TOKENS_PER_TASK", "FORGE_MAX_OUTPUT_TOKENS_PER_TASK")
            ),
          }
        : {}),
      ...(getAnvilEnv("ANVIL_MAX_ESTIMATED_TOKENS_PER_RUN", "FORGE_MAX_ESTIMATED_TOKENS_PER_RUN")
        ? {
            maxEstimatedTokensPerRun: Number(
              getAnvilEnv("ANVIL_MAX_ESTIMATED_TOKENS_PER_RUN", "FORGE_MAX_ESTIMATED_TOKENS_PER_RUN")
            ),
          }
        : {}),
      ...(getAnvilEnv("ANVIL_MAX_ESTIMATED_TOKENS_PER_AGENT", "FORGE_MAX_ESTIMATED_TOKENS_PER_AGENT")
        ? { maxEstimatedTokensPerAgent: readAgentTokenBudgets()! }
        : {}),
      ...(getAnvilEnv("ANVIL_MAX_TASK_DURATION_MS", "FORGE_MAX_TASK_DURATION_MS")
        ? { maxTaskDurationMs: Number(getAnvilEnv("ANVIL_MAX_TASK_DURATION_MS", "FORGE_MAX_TASK_DURATION_MS")) }
        : {}),
      ...(getAnvilEnv("ANVIL_MAX_TASK_DURATION_MS_BY_AGENT", "FORGE_MAX_TASK_DURATION_MS_BY_AGENT")
        ? { maxTaskDurationMsByAgent: readAgentDurationBudgets()! }
        : {}),
    });
    const provider = router;
    const plan = createReviewPlan(goal);
    const skills = selectSkills(await loadSkillRegistry(target), goal);
    const skillContext = formatSkillContext(skills);
    const hooks = await loadHooks(target);
    for (const record of plan.tasks) {
      const applied = applyBeforeAgentHooks(record.task, hooks);
      record.task = {
        ...applied.task,
        prompt: applied.context.length
          ? applied.task.prompt + "\n\nHook guidance:\n" + applied.context.join("\n")
          : applied.task.prompt,
      };
      if (applied.blockedReason) {
        record.status = "blocked";
        record.error = "Blocked by policy hook: " + applied.blockedReason;
      }
    }
    process.stdout.write(
      "Starting " + plan.id + " with provider " + provider.name + (model ? " (model " + model + ")" : "") + "\n"
    );
    if (skills.length) process.stdout.write("Selected skills: " + skills.map((skill) => skill.id).join(", ") + "\n");
    if (hooks.length) process.stdout.write("Loaded policy hooks: " + hooks.length + "\n");
    const memory = await buildProjectMemoryContext(target, goal);
    const projectContext = [memory.text, skillContext].filter(Boolean).join("\n\n");
    const completed = await advanceRun(plan, provider, new Set(), {
      maxConcurrency: 4,
      projectContext,
      projectContextForTask: (task) => buildAgentWorkspaceContext(target, task),
    });
    const saved = await saveRun(target, completed);
    const tracePath = await saveExecutionTrace(target, completed.id, router.traces);
    process.stdout.write(
      `Run status: ${completed.status}\nSaved history: ${path.relative(target, saved)}\nExecution trace: ${path.relative(target, tracePath)}\n`
    );
    const totals = router.traces.reduce(
      (sum, trace) => ({
        input: sum.input + trace.inputTokensEstimate,
        output: sum.output + trace.outputTokensEstimate,
        duration: sum.duration + trace.durationMs,
        fallback: sum.fallback + (trace.outcome === "fallback" ? 1 : 0),
      }),
      { input: 0, output: 0, duration: 0, fallback: 0 }
    );
    process.stdout.write(
      `Estimated tokens: ${totals.input} in / ${totals.output} out | Agent time: ${totals.duration} ms | Fallbacks: ${totals.fallback}\n`
    );
    for (const task of completed.tasks)
      process.stdout.write(`  ${task.status.padEnd(18)} ${task.task.agent}: ${task.task.title}\n`);
    if (completed.status === "failed") process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`FORGE run failed: ${message}\n`);
    process.exitCode = 1;
  }
  return;
}
