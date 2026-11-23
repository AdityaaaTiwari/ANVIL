import path from "node:path";
import {
  evaluateRun,
  evaluateRunWithJudge,
  formatEvaluationReport,
  loadEvaluationSuites,
  saveEvaluationReport,
  type EvaluationReport,
  type JudgedEvaluationReport,
} from "../core/evaluation-engine.js";
import { loadRun } from "../core/run-store.js";
import { getAnvilEnv } from "../core/env-compat.js";
import { ClaudeCodeProvider } from "../ai/claude-code-provider.js";
import { OpenAICompatibleProvider } from "../core/openai-compatible-provider.js";

export async function runEvaluate(_command: string, rest: string[]): Promise<void> {
  const runId = rest.find((arg) => !arg.startsWith("--"));
  const pathIndex = rest.indexOf("--path"),
    suiteIndex = rest.indexOf("--suite");
  const target = path.resolve(pathIndex >= 0 ? (rest[pathIndex + 1] ?? ".") : ".");
  const suiteId = suiteIndex >= 0 ? rest[suiteIndex + 1] : undefined;
  if (!runId) {
    process.stderr.write("Usage: anvil evaluate RUNID [--suite SUITE_ID] [--path PROJECT]\n");
    process.exitCode = 1;
    return;
  }
  try {
    const suites = await loadEvaluationSuites(target);
    const suite = suiteId ? suites.find((item) => item.id === suiteId) : suites[0];
    if (!suite)
      throw new Error(
        suiteId ? "Evaluation suite not found: " + suiteId : "No evaluation suite found. Add one under .forge/evals/."
      );
    const run = await loadRun(target, runId);
    const judgeEnabled = rest.includes("--judge");
    let report: EvaluationReport | JudgedEvaluationReport;
    if (judgeEnabled) {
      const providerChoice = getAnvilEnv("ANVIL_AI_PROVIDER", "FORGE_AI_PROVIDER", "openai")!;
      const model =
        getAnvilEnv("ANVIL_EVAL_JUDGE_MODEL", "FORGE_EVAL_JUDGE_MODEL") ??
        getAnvilEnv("ANVIL_AI_MODEL", "FORGE_AI_MODEL") ??
        getAnvilEnv("ANVIL_MODEL", "FORGE_MODEL") ??
        (providerChoice === "claude-code" ? "sonnet" : "gpt-4.1");
      const apiKey = getAnvilEnv("ANVIL_API_KEY", "FORGE_API_KEY") ?? process.env.OPENAI_API_KEY ?? "";
      const baseUrl = getAnvilEnv("ANVIL_BASE_URL", "FORGE_BASE_URL", "https://api.openai.com/v1")!;
      if (providerChoice !== "claude-code" && !apiKey)
        throw new Error("Set ANVIL_API_KEY, FORGE_API_KEY, or OPENAI_API_KEY to use model-judged evaluation.");
      const judgeProvider =
        providerChoice === "claude-code"
          ? new ClaudeCodeProvider({ cwd: target, model })
          : new OpenAICompatibleProvider({ apiKey, model, baseUrl });
      report = await evaluateRunWithJudge(run, suite, judgeProvider);
    } else report = evaluateRun(run, suite);
    const reportPath = await saveEvaluationReport(target, report);
    process.stdout.write(formatEvaluationReport(report) + "\n");
    if ("judgedCases" in report) {
      process.stdout.write(
        "Model judge: " +
          report.judge.provider +
          (report.judge.model ? " / " + report.judge.model : "") +
          " · " +
          report.judge.evaluatedCases +
          " cases\n"
      );
      for (const item of report.judgedCases)
        process.stdout.write("  " + item.caseId + " · " + item.result.score + "/100 · " + item.result.rationale + "\n");
    }
    process.stdout.write("Saved: " + reportPath + "\n");
    if (!report.passed || ("judge" in report && !report.judge.passed)) process.exitCode = 2;
  } catch (error) {
    process.stderr.write("FORGE evaluation failed: " + (error instanceof Error ? error.message : String(error)) + "\n");
    process.exitCode = 1;
  }
  return;
}
