import path from "node:path";
import {
  executeBenchmarkMatrix,
  fingerprintAgentConfig,
  formatBenchmarkMatrix,
  loadBenchmarkMatrix,
  saveBenchmarkMatrix,
} from "../core/benchmark-matrix.js";
import { loadAgentConfigVersion, materializeAgentConfigVersion } from "../core/agent-config-versioning.js";
import { evaluateRun, loadEvaluationSuites, saveEvaluationReport } from "../core/evaluation-engine.js";
import { getAnvilEnv } from "../core/env-compat.js";
import { ClaudeCodeProvider } from "../ai/claude-code-provider.js";
import { createHostedAgentProvider } from "../core/hosted-agent-provider.js";
import { ModelRouter } from "../core/model-router.js";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import { createReviewPlan } from "../core/review-planner.js";
import { formatSkillContext, loadSkillRegistry, selectSkills } from "../core/skill-registry.js";
import { loadAgentRegistry } from "../core/agent-registry.js";
import { loadPermissionPolicy } from "../core/permission-policy.js";
import { applyBeforeAgentHooks, loadHooks } from "../core/hook-engine.js";
import { buildProjectMemoryContext } from "../core/project-memory.js";
import { advanceRun } from "../core/orchestrator.js";
import { buildAgentWorkspaceContext } from "../core/agent-workspace-context.js";
import { saveRun } from "../core/run-store.js";
import { saveExecutionTrace } from "../core/execution-trace.js";
import { captureExperimentManifest, saveExperimentManifest } from "../core/experiment-manifest.js";
import { readAgentDurationBudgets, readAgentTokenBudgets } from "./shared.js";

export async function runBenchmarkMatrix(_command: string, rest: string[]): Promise<void> {
  const configFile = rest.find((arg) => !arg.startsWith("--"));
  const suiteIndex = rest.indexOf("--suite"),
    goalIndex = rest.indexOf("--goal"),
    pathIndex = rest.indexOf("--path");
  const target = path.resolve(pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : ".");
  const suiteId = suiteIndex >= 0 ? rest[suiteIndex + 1] : undefined;
  const goalEnd = goalIndex >= 0 ? rest.findIndex((arg, index) => index > goalIndex && arg.startsWith("--")) : -1;
  const goal =
    goalIndex >= 0
      ? rest
          .slice(goalIndex + 1, goalEnd >= 0 ? goalEnd : rest.length)
          .join(" ")
          .trim()
      : "";
  if (!configFile || !suiteId || !goal) {
    process.stderr.write(
      'Usage: anvil benchmark-matrix CONFIG.json --suite SUITE_ID --goal "engineering task" [--path PROJECT]\n'
    );
    process.exitCode = 1;
    return;
  }
  try {
    const config = await loadBenchmarkMatrix(path.resolve(configFile));
    const configVersions = new Map<string, { id: string; fingerprint: string }>();
    for (const candidate of config.candidates) {
      if (!candidate.configVersionId) continue;
      const snapshot = await loadAgentConfigVersion(target, candidate.configVersionId);
      configVersions.set(candidate.id, { id: snapshot.id, fingerprint: fingerprintAgentConfig(snapshot.files) });
    }
    const suites = await loadEvaluationSuites(target);
    const suite = suites.find((item) => item.id === suiteId);
    if (!suite) throw new Error("Evaluation suite not found: " + suiteId);
    const apiKey = getAnvilEnv("ANVIL_API_KEY") ?? process.env.OPENAI_API_KEY ?? "";
    const baseUrl = getAnvilEnv("ANVIL_BASE_URL", "https://api.openai.com/v1")!;
    const report = await executeBenchmarkMatrix(config, async (candidate, _repeat) => {
      const createProvider = (selectedModel: string) =>
        candidate.provider === "claude-code"
          ? new ClaudeCodeProvider({ cwd: target, model: selectedModel })
          : createHostedAgentProvider(
              {
                ...process.env,
                ANVIL_AI_PROVIDER: candidate.provider,
                ...(apiKey ? { ANVIL_API_KEY: apiKey } : {}),
                ...(baseUrl ? { ANVIL_BASE_URL: baseUrl } : {}),
              },
              selectedModel
            );
      const router = new ModelRouter({
        fastModel: candidate.model,
        balancedModel: candidate.model,
        reasoningModel: candidate.model,
        retryAttempts: Number(getAnvilEnv("ANVIL_MODEL_RETRY_ATTEMPTS", "2")),
        retryDelayMs: Number(getAnvilEnv("ANVIL_MODEL_RETRY_DELAY_MS", "500")),
        ...(getAnvilEnv("ANVIL_MAX_INPUT_TOKENS_PER_TASK")
          ? {
              maxInputTokensPerTask: Number(getAnvilEnv("ANVIL_MAX_INPUT_TOKENS_PER_TASK")),
            }
          : {}),
        ...(getAnvilEnv("ANVIL_MAX_OUTPUT_TOKENS_PER_TASK")
          ? {
              maxOutputTokensPerTask: Number(getAnvilEnv("ANVIL_MAX_OUTPUT_TOKENS_PER_TASK")),
            }
          : {}),
        ...(getAnvilEnv("ANVIL_MAX_ESTIMATED_TOKENS_PER_RUN")
          ? {
              maxEstimatedTokensPerRun: Number(getAnvilEnv("ANVIL_MAX_ESTIMATED_TOKENS_PER_RUN")),
            }
          : {}),
        ...(getAnvilEnv("ANVIL_MAX_ESTIMATED_TOKENS_PER_AGENT")
          ? { maxEstimatedTokensPerAgent: readAgentTokenBudgets()! }
          : {}),
        ...(getAnvilEnv("ANVIL_MAX_TASK_DURATION_MS")
          ? { maxTaskDurationMs: Number(getAnvilEnv("ANVIL_MAX_TASK_DURATION_MS")) }
          : {}),
        ...(getAnvilEnv("ANVIL_MAX_TASK_DURATION_MS_BY_AGENT")
          ? { maxTaskDurationMsByAgent: readAgentDurationBudgets()! }
          : {}),
        createProvider,
      });
      const configWorkspace = await mkdtemp(path.join(os.tmpdir(), "anvil-candidate-config-"));
      try {
        const snapshotId = candidate.configVersionId;
        const snapshot = snapshotId
          ? await materializeAgentConfigVersion(target, snapshotId, configWorkspace)
          : undefined;
        if (snapshotId && !snapshot?.files.some((file) => file.path === "hooks.json")) {
          throw new Error(
            "Configuration snapshot " +
              snapshotId +
              " predates policy-hook isolation. Capture a new snapshot before benchmarking this candidate."
          );
        }
        const configRoot = snapshotId ? configWorkspace : target;
        const run = createReviewPlan(goal);
        const skillRegistry = await loadSkillRegistry(configRoot);
        const agentRegistry = await loadAgentRegistry(configRoot);
        const requestedSkillIds = candidate.skillIds;
        const unknownSkills = (requestedSkillIds ?? []).filter((id) => !skillRegistry.some((skill) => skill.id === id));
        if (unknownSkills.length)
          throw new Error("Candidate " + candidate.id + " references unknown skill(s): " + unknownSkills.join(", "));
        const selectedSkillsForTask = (task: { agent: string; title: string; prompt: string }) =>
          requestedSkillIds === undefined
            ? selectSkills(skillRegistry, task.agent + " " + task.title + " " + task.prompt)
            : skillRegistry.filter((skill) => requestedSkillIds.includes(skill.id));
        const agentGuidanceForTask = (task: { agent: string }) =>
          agentRegistry.find((agent) => agent.id === task.agent)?.instructions ?? "";
        const permissions = await loadPermissionPolicy(configRoot);
        if (permissions.mode !== "proposal-only" || permissions.allowedTools.length > 0)
          throw new Error(
            "Benchmark candidate " +
              candidate.id +
              " requests unsupported tool permissions. ANVIL currently enforces proposal-only execution with no enabled tools."
          );
        const hooks = await loadHooks(configRoot);
        for (const record of run.tasks) {
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
        const memory = await buildProjectMemoryContext(target, goal);
        const projectContext = memory.text;
        const started = Date.now();
        const completed = await advanceRun(run, router, new Set(), {
          maxConcurrency: 4,
          projectContext,
          projectContextForTask: async (task) =>
            [
              agentGuidanceForTask(task),
              formatSkillContext(selectedSkillsForTask(task)),
              await buildAgentWorkspaceContext(target, task),
            ]
              .filter(Boolean)
              .join("\n\n"),
        });
        const durationMs = Date.now() - started;
        await saveRun(target, completed);
        await saveExecutionTrace(target, completed.id, router.traces);
        const evaluation = evaluateRun(completed, suite);
        await saveEvaluationReport(target, evaluation);
        return {
          runId: completed.id,
          score: evaluation.score,
          passed: evaluation.passed,
          durationMs,
          estimatedTokens: router.traces.reduce(
            (sum, item) => sum + item.inputTokensEstimate + item.outputTokensEstimate,
            0
          ),
          agentScores: evaluation.cases
            .filter((item) => item.status === "scored")
            .map((item) => {
              const task = completed.tasks.find((record) => record.task.id === item.taskId)?.task;
              const appliedSkills = task ? selectedSkillsForTask(task) : [];
              return {
                agent: item.agent,
                caseId: item.caseId,
                score: item.score,
                passed: item.passed,
                skillIds: appliedSkills.map((skill) => skill.id),
                failedCriteria: item.criteria
                  .filter((criterion) => !criterion.passed)
                  .map((criterion) => ({
                    id: criterion.id,
                    failedChecks: criterion.checks
                      .filter((check) => !check.passed)
                      .map((check) => check.rule + ": " + check.detail),
                  })),
              };
            }),
        };
      } finally {
        await rm(configWorkspace, { recursive: true, force: true });
      }
    });
    report.suiteId = suite.id;
    report.goal = goal;
    if (configVersions.size)
      report.candidateProvenance = [...configVersions.entries()].map(([candidateId, item]) => ({
        candidateId,
        configVersionId: item.id,
        fingerprint: item.fingerprint,
      }));
    const experimentManifest = await captureExperimentManifest({
      projectPath: target,
      matrixFile: path.resolve(configFile),
      matrixId: config.id,
      suiteId: suite.id,
      suite,
      provider: "matrix",
      model: "candidate-specific",
      ...(getAnvilEnv("ANVIL_BASE_URL") ? { baseUrl: getAnvilEnv("ANVIL_BASE_URL")! } : {}),
      agentConfigFingerprints: report.candidateProvenance ?? [],
    });
    const manifestPath = await saveExperimentManifest(target, experimentManifest);
    report.experimentManifest = { id: experimentManifest.id, fingerprint: experimentManifest.fingerprint };
    const saved = await saveBenchmarkMatrix(target, report);
    process.stdout.write(
      "Experiment manifest: " +
        experimentManifest.id +
        " · sha256:" +
        experimentManifest.fingerprint +
        "\nManifest saved: " +
        path.relative(target, manifestPath) +
        "\n"
    );
    process.stdout.write(formatBenchmarkMatrix(report) + "\nSaved: " + path.relative(target, saved) + "\n");
    if (report.results.some((item) => item.status === "failed") || report.results.some((item) => !item.passed))
      process.exitCode = 2;
  } catch (error) {
    process.stderr.write(
      "ANVIL benchmark matrix failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  }
  return;
}
