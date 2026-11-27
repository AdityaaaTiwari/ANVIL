// Maps each CLI command name to its handler.
import { runInit } from "./init.js";
import { runInstall } from "./install.js";
import { runEvals } from "./evals.js";
import { runAgentRelease } from "./agent-release.js";
import { runAgentConfig } from "./agent-config.js";
import { runExperimentHistory } from "./experiment-history.js";
import { runExperimentStudio } from "./experiment-studio.js";
import { runAgentEvolution } from "./agent-evolution.js";
import { runAgentIntelligence } from "./agent-intelligence.js";
import { runOptimizeAgents } from "./optimize-agents.js";
import { runBenchmarkRegression } from "./benchmark-regression.js";
import { runExperiment } from "./experiment.js";
import { runBenchmarkMatrix } from "./benchmark-matrix.js";
import { runBenchmark } from "./benchmark.js";
import { runEvaluate } from "./evaluate.js";
import { runAgents } from "./agents.js";
import { runSkills } from "./skills.js";
import { runAgentSecurity } from "./agent-security.js";
import { runHook } from "./hook.js";
import { runMemory } from "./memory.js";
import { runMcp } from "./mcp.js";
import { runAdr } from "./adr.js";
import { runSecurity } from "./security.js";
import { runGate } from "./gate.js";
import { runPlan } from "./plan.js";
import { runReplay } from "./replay.js";
import { runApprove } from "./approve.js";
import { runResume } from "./resume.js";
import { runTrace } from "./trace.js";
import { runRuns } from "./runs.js";
import { runShowRun } from "./show-run.js";
import { runRun } from "./run.js";
import { runDeps } from "./deps.js";
import { runSnapshot } from "./snapshot.js";
import { runTimeline } from "./timeline.js";
import { runChangeRisk } from "./change-risk.js";
import { runRisk } from "./risk.js";
import { runImpact } from "./impact.js";
import { runSearch } from "./search.js";
import { runDashboard } from "./dashboard.js";
import { runVerify } from "./verify.js";
import { runSandboxProfiles } from "./sandbox-profiles.js";
import { runSandboxCleanupHistory } from "./sandbox-cleanup-history.js";
import { runSandboxCleanup } from "./sandbox-cleanup.js";
import { runSandboxPolicyCheck } from "./sandbox-policy-check.js";
import { runSandboxCompliance } from "./sandbox-compliance.js";
import { runSandboxStatus } from "./sandbox-status.js";
import { runPatchVerify } from "./patch-verify.js";
import { runVerifyHistory } from "./verify-history.js";
import { runReview } from "./review.js";
import { runReviewHistory } from "./review-history.js";
import { runReviewShow } from "./review-show.js";
import { runReviewCompare } from "./review-compare.js";
import { runRegression } from "./regression.js";
import { runPatchReview } from "./patch-review.js";
import { runPatchStage } from "./patch-stage.js";
import { runPatchApprove } from "./patch-approve.js";
import { runPatchApprovalCheck } from "./patch-approval-check.js";
import { runPatchCheck } from "./patch-check.js";
import { runGit } from "./git.js";
import { runDeep } from "./deep.js";
import { runRemediate } from "./remediate.js";
import { runHealth } from "./health.js";
import { runClean } from "./clean.js";
import { runUndo } from "./undo.js";
import { runQuality } from "./quality.js";
import { runInspect } from "./inspect.js";
import { runDoctor } from "./doctor.js";
import { runBinary } from "./binary.js";
import { runCallGraph } from "./call-graph.js";
import { runSupplyChain } from "./supply-chain.js";
import { runScorecard } from "./scorecard.js";
import { runConsult } from "./consult.js";
import { runContext } from "./context.js";
import { runStatus } from "./status.js";
import { runGuard } from "./guard.js";
import { runCatalog } from "./catalog.js";
import { runAnalyze } from "./analyze.js";
import { runPlugin } from "./plugin.js";
import { runApp } from "./app.js";
import { runInstincts } from "./instincts.js";
import { runCost } from "./cost.js";
import { runRaceCommand } from "./race.js";
import { runLoopCommand } from "./loop.js";
import { runShieldCommand } from "./shield.js";
import { runHarnesses } from "./harnesses.js";

export type CommandHandler = (command: string, rest: string[]) => Promise<void>;

export const COMMANDS: ReadonlyMap<string, CommandHandler> = new Map<string, CommandHandler>([
  ["init", runInit],
  ["install", runInstall],
  ["repair", runInstall],
  ["uninstall", runInstall],
  ["binary", runBinary],
  ["call-graph", runCallGraph],
  ["supply-chain", runSupplyChain],
  ["scorecard", runScorecard],
  ["harness-audit", runScorecard],
  ["consult", runConsult],
  ["context", runContext],
  ["status", runStatus],
  ["guard", runGuard],
  ["catalog", runCatalog],
  ["analyze", runAnalyze],
  ["plugin", runPlugin],
  ["app", runApp],
  ["statusline", runStatus],
  ["instinct", runInstincts],
  ["instincts", runInstincts],
  ["evolve", runInstincts],
  ["cost", runCost],
  ["cost-report", runCost],
  ["race", runRaceCommand],
  ["loop", runLoopCommand],
  ["shield", runShieldCommand],
  ["harnesses", runHarnesses],
  ["evals", runEvals],
  ["agent-release", runAgentRelease],
  ["agent-config", runAgentConfig],
  ["experiment-history", runExperimentHistory],
  ["experiment-studio", runExperimentStudio],
  ["agent-evolution", runAgentEvolution],
  ["agent-intelligence", runAgentIntelligence],
  ["optimize-agents", runOptimizeAgents],
  ["benchmark-regression", runBenchmarkRegression],
  ["experiment", runExperiment],
  ["benchmark-matrix", runBenchmarkMatrix],
  ["benchmark", runBenchmark],
  ["evaluate", runEvaluate],
  ["agents", runAgents],
  ["skills", runSkills],
  ["agent-security", runAgentSecurity],
  ["hook", runHook],
  ["hooks", runHook],
  ["memory", runMemory],
  ["mcp", runMcp],
  ["adr", runAdr],
  ["security", runSecurity],
  ["gate", runGate],
  ["plan", runPlan],
  ["replay", runReplay],
  ["approve", runApprove],
  ["resume", runResume],
  ["trace", runTrace],
  ["runs", runRuns],
  ["show-run", runShowRun],
  ["run", runRun],
  ["deps", runDeps],
  ["snapshot", runSnapshot],
  ["timeline", runTimeline],
  ["change-risk", runChangeRisk],
  ["risk", runRisk],
  ["impact", runImpact],
  ["search", runSearch],
  ["dashboard", runDashboard],
  ["verify", runVerify],
  ["sandbox-profiles", runSandboxProfiles],
  ["sandbox-cleanup-history", runSandboxCleanupHistory],
  ["sandbox-cleanup", runSandboxCleanup],
  ["sandbox-policy-check", runSandboxPolicyCheck],
  ["sandbox-compliance", runSandboxCompliance],
  ["sandbox-status", runSandboxStatus],
  ["patch-verify", runPatchVerify],
  ["verify-history", runVerifyHistory],
  ["review", runReview],
  ["review-history", runReviewHistory],
  ["review-show", runReviewShow],
  ["review-compare", runReviewCompare],
  ["regression", runRegression],
  ["patch-review", runPatchReview],
  ["patch-stage", runPatchStage],
  ["patch-approve", runPatchApprove],
  ["patch-approval-check", runPatchApprovalCheck],
  ["patch-check", runPatchCheck],
  ["git", runGit],
  ["deep", runDeep],
  ["remediate", runRemediate],
  ["health", runHealth],
  ["clean", runClean],
  ["fix", runClean],
  ["undo", runUndo],
  ["quality", runQuality],
  ["inspect", runInspect],
  ["map", runInspect],
  ["doctor", runDoctor],
]);
