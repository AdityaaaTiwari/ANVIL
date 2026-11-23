import path from "node:path";
import { assertSupportedAgentPolicy, loadPermissionPolicy } from "../core/permission-policy.js";
import { getAnvilEnv } from "../core/env-compat.js";
import { loadRun, recoverInterruptedRun, saveRun, withRunExecutionLock } from "../core/run-store.js";
import { ClaudeCodeProvider } from "../ai/claude-code-provider.js";
import { createHostedAgentProvider } from "../core/hosted-agent-provider.js";
import { loadExecutionTrace, saveExecutionTrace } from "../core/execution-trace.js";
import { ModelRouter } from "../core/model-router.js";
import { buildProjectMemoryContext } from "../core/project-memory.js";
import { applyBeforeAgentHooks, loadHooks } from "../core/hook-engine.js";
import { advanceRun, type RunRecord } from "../core/orchestrator.js";
import { buildAgentWorkspaceContext } from "../core/agent-workspace-context.js";
import { readAgentDurationBudgets, readAgentTokenBudgets } from "./shared.js";

export async function runResume(_command: string, rest: string[]): Promise<void> {
  const runId = rest[0] ?? "";
  const pathIndex = rest.indexOf("--path");
  const target = path.resolve(pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : ".");
  try {
    if (!runId) throw new Error("Usage: anvil resume RUN_ID [--path PROJECT]");
    const permissions = await loadPermissionPolicy(target);
    const providerChoice = getAnvilEnv("ANVIL_AI_PROVIDER", "FORGE_AI_PROVIDER", "openai")!.toLowerCase();
    assertSupportedAgentPolicy(permissions, providerChoice, "ANVIL resume");
    await withRunExecutionLock(target, runId, async () => {
      const savedRun = await loadRun(target, runId);
      if (savedRun.status === "running") {
        const recovered = await recoverInterruptedRun(target, runId);
        process.stdout.write("Recovered interrupted run " + runId + ": " + recovered.status + "\n");
        process.stdout.write(
          "Any task that was running has an unknown provider outcome and was marked failed. ANVIL did not replay provider requests. Review the run before explicitly retrying failed work.\n"
        );
        return;
      }
      if (savedRun.status !== "pending" && savedRun.status !== "awaiting_approval")
        throw new Error(
          "Only pending or approval-cleared runs can be resumed. Use `anvil replay` only after reviewing failed tasks."
        );
      const model = getAnvilEnv("ANVIL_AI_MODEL", "FORGE_AI_MODEL") ?? getAnvilEnv("ANVIL_MODEL", "FORGE_MODEL");
      const baseModel = model ?? (providerChoice === "claude-code" ? "sonnet" : "gpt-4.1-mini");
      const createProvider = (selectedModel: string) =>
        providerChoice === "claude-code"
          ? new ClaudeCodeProvider({ cwd: target, model: selectedModel })
          : createHostedAgentProvider(
              { ...process.env, ANVIL_AI_PROVIDER: providerChoice, FORGE_AI_PROVIDER: providerChoice },
              selectedModel,
              { workspacePath: target, permissionPolicy: permissions }
            );
      let priorTraceEntries: Awaited<ReturnType<typeof loadExecutionTrace>>["entries"] = [];
      try {
        priorTraceEntries = (await loadExecutionTrace(target, runId)).entries;
      } catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
      }
      const traceAgentUsage = priorTraceEntries.reduce<Record<string, number>>((usage, entry) => {
        usage[entry.agent] = (usage[entry.agent] ?? 0) + entry.inputTokensEstimate + entry.outputTokensEstimate;
        return usage;
      }, {});
      const traceRunUsage = priorTraceEntries.reduce(
        (total, entry) => total + entry.inputTokensEstimate + entry.outputTokensEstimate,
        0
      );
      const priorAgentUsage = savedRun.tokenUsage?.estimatedTokensByAgent ?? traceAgentUsage;
      const priorRunUsage = savedRun.tokenUsage?.estimatedTokensUsed ?? traceRunUsage;
      const resumeFallback = getAnvilEnv("ANVIL_FALLBACK_MODEL", "FORGE_FALLBACK_MODEL");
      const router = new ModelRouter({
        fastModel: getAnvilEnv("ANVIL_MODEL_FAST", "FORGE_MODEL_FAST") ?? baseModel,
        balancedModel: getAnvilEnv("ANVIL_MODEL_BALANCED", "FORGE_MODEL_BALANCED") ?? baseModel,
        reasoningModel: getAnvilEnv("ANVIL_MODEL_REASONING", "FORGE_MODEL_REASONING") ?? baseModel,
        ...(resumeFallback ? { fallbackModel: resumeFallback } : {}),
        retryAttempts: Number(getAnvilEnv("ANVIL_MODEL_RETRY_ATTEMPTS", "FORGE_MODEL_RETRY_ATTEMPTS", "2")),
        retryDelayMs: Number(getAnvilEnv("ANVIL_MODEL_RETRY_DELAY_MS", "FORGE_MODEL_RETRY_DELAY_MS", "500")),
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
        initialEstimatedTokensUsed: priorRunUsage,
        initialEstimatedTokensByAgent: priorAgentUsage,
        createProvider,
      });
      const memory = await buildProjectMemoryContext(target, savedRun.goal);
      // Re-check current workspace policy before resuming any task that has not completed.
      // Previously applied hook guidance is kept in the saved prompt and is not appended twice.
      const resumeHooks = await loadHooks(target);
      for (const record of savedRun.tasks) {
        if (record.status !== "pending" && record.status !== "awaiting_approval") continue;
        const applied = applyBeforeAgentHooks(record.task, resumeHooks);
        const additions = applied.context.filter((message) => !record.task.prompt.includes(message));
        record.task = {
          ...applied.task,
          prompt: additions.length
            ? record.task.prompt + "\n\nHook guidance:\n" + additions.join("\n")
            : record.task.prompt,
        };
        if (applied.blockedReason) {
          record.status = "blocked";
          record.error = "Blocked by current policy hook: " + applied.blockedReason;
        }
      }
      const currentTokenUsage = () => {
        const usage = router.traces.reduce(
          (total, entry) => {
            total.estimatedTokensUsed += entry.inputTokensEstimate + entry.outputTokensEstimate;
            total.estimatedTokensByAgent[entry.agent] =
              (total.estimatedTokensByAgent[entry.agent] ?? 0) + entry.inputTokensEstimate + entry.outputTokensEstimate;
            return total;
          },
          {
            estimatedTokensUsed: priorRunUsage,
            estimatedTokensByAgent: { ...priorAgentUsage } as Record<string, number>,
          }
        );
        return usage;
      };
      let persistedTraceEntries = 0;
      const persistRunSnapshot = async (snapshot: RunRecord) => {
        await saveRun(target, { ...snapshot, tokenUsage: currentTokenUsage() });
        const newEntries = router.traces.slice(persistedTraceEntries);
        if (newEntries.length) {
          await saveExecutionTrace(target, snapshot.id, newEntries);
          persistedTraceEntries = router.traces.length;
        }
      };
      const completed = await advanceRun(savedRun, router, new Set(), {
        maxConcurrency: 4,
        projectContext: memory.text,
        projectContextForTask: (task) => buildAgentWorkspaceContext(target, task),
        shouldCancel: async () => (await loadRun(target, runId)).status === "cancelled",
        onTaskSettled: persistRunSnapshot,
        onUpdate: persistRunSnapshot,
      });
      const saved = await saveRun(target, { ...completed, tokenUsage: currentTokenUsage() });
      const tracePath = await saveExecutionTrace(target, completed.id, router.traces.slice(persistedTraceEntries));
      process.stdout.write("Resumed " + runId + ": " + completed.status + "\n");
      process.stdout.write(
        "Saved: " + path.relative(target, saved) + "\nTrace: " + path.relative(target, tracePath) + "\n"
      );
    });
  } catch (error) {
    process.stderr.write("Could not resume run: " + (error instanceof Error ? error.message : String(error)) + "\n");
    process.exitCode = 1;
  }
  return;
}
