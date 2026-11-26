import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { listAdrs } from "../adr-engine.js";
import { listAgentConfigReleases } from "../agent-config-release.js";
import { listAgentConfigVersions } from "../agent-config-versioning.js";
import { buildAgentEvaluationIntelligence } from "../agent-evaluation-intelligence.js";
import { buildAgentOptimizationPlan } from "../agent-optimization.js";
import { loadAgentRegistry } from "../agent-registry.js";
import { auditAgentConfiguration } from "../agent-security-audit.js";
import { mapArchitecture } from "../architecture-map.js";
import { buildSymbolCallGraph, querySymbolCallGraph } from "../call-graph.js";
import { listBenchmarks } from "../benchmark-engine.js";
import { listBenchmarkMatrices } from "../benchmark-matrix.js";
import { loadBenchmarkRegression } from "../benchmark-regression.js";
import { analyzeChangeIntelligence } from "../change-intelligence.js";
import { searchWorkspace } from "../code-search.js";
import { buildDependencyGraph } from "../dependency-graph.js";
import { analyzeDependencies } from "../dependency-intelligence.js";
import { runDoctorChecks } from "../doctor.js";
import { analyzeEngineeringRisk } from "../engineering-risk.js";
import { listEvaluationReports } from "../evaluation-engine.js";
import { loadExecutionTrace } from "../execution-trace.js";
import { buildExperimentHistory } from "../experiment-history.js";
import { buildScorecard } from "../harness-scorecard.js";
import { compareLatestIntelligence, listIntelligenceSnapshots } from "../intelligence-timeline.js";
import { evaluateGate } from "../policy-engine.js";
import { cleanProject } from "../project-cleaner.js";
import { generateProjectHealth } from "../project-health.js";
import { inspectProject } from "../project-inspector.js";
import { listProjectMemory } from "../project-memory.js";
import { auditProject } from "../quality-audit.js";
import { analyzeBinaryIntelligence } from "../binary-intelligence.js";
import { scanSupplyChain } from "../supply-chain-scanner.js";
import { generateRegressionReport } from "../regression-intelligence.js";
import { listReviews } from "../review-history.js";
import { listRuns, loadRun } from "../run-store.js";
import { scanProjectSecurity } from "../security-scanner.js";
import { loadSkillRegistry } from "../skill-registry.js";
import { listVerifications } from "../verification-history.js";
import { listWorkflows } from "../workflow-store.js";
import { listWorkspaceDirectory, readWorkspaceFile } from "../workspace-browser.js";
import { ANVIL_STATE_DIR } from "../workspace-paths.js";
import { safeProviderOrigin, sendJson } from "./http-helpers.js";
import { handleSseRequest } from "./sse.js";

function isEnoent(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

function parseBudgetMap(raw: string | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).filter(
            (item): item is [string, number] => typeof item[1] === "number" && Number.isFinite(item[1]) && item[1] > 0
          )
        )
      : {};
  } catch {
    return {};
  }
}

async function readSingleConfigFile(root: string, category: string, id: string): Promise<string> {
  const realRoot = await realpath(root);
  let lastNotFound: unknown = null;
  for (const stateDirName of [ANVIL_STATE_DIR]) {
    const stateDirectory = path.join(root, stateDirName);
    const directory = path.join(stateDirectory, category);
    const file = path.join(directory, `${id}.md`);
    try {
      const realState = await realpath(stateDirectory);
      const realDirectory = await realpath(directory);
      if (realState !== path.join(realRoot, stateDirName) || realDirectory !== path.join(realState, category)) {
        throw new Error("Configuration directories must not be symbolic links.");
      }
      const info = await lstat(file);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 128 * 1024) {
        throw new Error("Configuration file is not a supported regular Markdown file.");
      }
      return await readFile(file, "utf8");
    } catch (error) {
      if (isEnoent(error)) {
        lastNotFound = error;
        continue;
      }
      throw error;
    }
  }
  throw lastNotFound instanceof Error ? lastNotFound : new Error("Configuration file not found.");
}

async function listConfigFiles(
  root: string,
  categories: string[]
): Promise<Array<{ category: string; id: string; bytes: number }>> {
  const realRoot = await realpath(root);
  const seen = new Map<string, { category: string; id: string; bytes: number }>();
  for (const stateDirName of [ANVIL_STATE_DIR]) {
    const stateDirectory = path.join(root, stateDirName);
    for (const kind of categories) {
      const directory = path.join(stateDirectory, kind);
      let entries;
      try {
        const realState = await realpath(stateDirectory);
        const realDirectory = await realpath(directory);
        if (realState !== path.join(realRoot, stateDirName) || realDirectory !== path.join(realState, kind)) {
          throw new Error("Configuration directories must not be symbolic links.");
        }
        entries = await readdir(directory, { withFileTypes: true });
      } catch (error) {
        if (isEnoent(error)) continue;
        throw error;
      }
      for (const entry of entries) {
        const name = entry.name.replace(/\.md$/, "");
        if (!entry.isFile() || !entry.name.endsWith(".md") || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) continue;
        const info = await lstat(path.join(directory, entry.name));
        if (info.isSymbolicLink() || info.size > 128 * 1024) continue;
        const key = `${kind}:${name}`;
        if (!seen.has(key)) {
          seen.set(key, { category: kind, id: name, bytes: info.size });
        }
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id));
}

/**
 * Handles GET requests (including SSE and HTML page) for the local ANVIL dashboard.
 */
export async function handleDashboardGet(
  request: IncomingMessage,
  response: ServerResponse,
  requestUrl: URL,
  projectPath: string,
  pageHtml: string,
  version: string
): Promise<boolean> {
  if (requestUrl.pathname === "/api/events") {
    handleSseRequest(request, response);
    return true;
  }

  if (requestUrl.pathname === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(pageHtml);
    return true;
  }

  if (requestUrl.pathname === "/api/config-releases") {
    sendJson(response, 200, await listAgentConfigReleases(projectPath));
    return true;
  }

  if (requestUrl.pathname === "/api/providers") {
    const selected = (process.env.ANVIL_AI_PROVIDER ?? "openai").toLowerCase();
    const rows = [
      {
        id: "openai",
        configured: Boolean(process.env.ANVIL_API_KEY || process.env.OPENAI_API_KEY),
        model: process.env.ANVIL_AI_MODEL || process.env.ANVIL_MODEL || "gpt-4.1-mini",
        detail: "API credential presence only; connectivity is not tested.",
      },
      {
        id: "anthropic",
        configured: Boolean(process.env.ANTHROPIC_API_KEY),
        model: process.env.ANVIL_AI_MODEL || "claude-sonnet-4-5",
        detail: "API credential presence only; connectivity is not tested.",
      },
      {
        id: "google",
        configured: Boolean(process.env.GOOGLE_API_KEY),
        model: process.env.ANVIL_AI_MODEL || "gemini-2.5-flash",
        detail: "API credential presence only; connectivity is not tested.",
      },
      {
        id: "ollama",
        configured: true,
        model: process.env.ANVIL_AI_MODEL || "llama3.2",
        detail:
          "Endpoint origin: " +
          safeProviderOrigin(process.env.ANVIL_BASE_URL || process.env.OLLAMA_HOST || "http://localhost:11434") +
          "; connectivity is not tested.",
      },
      {
        id: "claude-code",
        configured: false,
        model: process.env.ANVIL_AI_MODEL || "sonnet",
        detail: "Local CLI installation and account authentication are not checked by the dashboard.",
      },
    ].map((item) => ({
      ...item,
      selected: selected === item.id,
      status: item.id === "claude-code" ? "not-checked" : item.configured ? "configured" : "needs-credentials",
    }));
    sendJson(response, 200, rows);
    return true;
  }

  if (requestUrl.pathname === "/api/config-snapshots") {
    const versions = await listAgentConfigVersions(projectPath);
    sendJson(
      response,
      200,
      versions.map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        createdBy: item.createdBy,
        note: item.note,
        status: item.status,
        approvedBy: item.approvedBy,
        files: item.files.map((file) => ({ path: file.path, sha256: file.sha256 })),
      }))
    );
    return true;
  }

  if (requestUrl.pathname === "/api/config-files") {
    const category = requestUrl.searchParams.get("category");
    const id = requestUrl.searchParams.get("id");
    if (category !== null && category !== "agents" && category !== "skills") {
      throw new Error("Choose agents or skills.");
    }
    if (id !== null && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new Error("Invalid configuration file ID.");
    if (id !== null && category === null) {
      throw new Error("A category is required when reading one configuration file.");
    }
    const root = path.resolve(projectPath);
    if (id !== null) {
      const content = await readSingleConfigFile(root, category!, id);
      sendJson(response, 200, { category, id, content });
      return true;
    }
    const categories = category ? [category] : ["agents", "skills"];
    sendJson(response, 200, await listConfigFiles(root, categories));
    return true;
  }

  if (requestUrl.pathname === "/api/workflows") {
    sendJson(response, 200, await listWorkflows(projectPath));
    return true;
  }

  if (requestUrl.pathname === "/api/overview") {
    const report = await inspectProject(projectPath);
    const runs = await listRuns(projectPath);
    sendJson(response, 200, {
      summary: report.summary,
      dependencies: report.dependencies,
      packageManagers: report.packageManagers,
      frameworks: report.frameworks,
      scripts: report.scripts,
      importantFiles: report.importantFiles,
      warnings: report.warnings,
      runCount: runs.length,
    });
    return true;
  }

  if (requestUrl.pathname === "/api/agents") {
    const agents = await loadAgentRegistry(projectPath);
    sendJson(
      response,
      200,
      agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        description: agent.description,
        source: agent.source,
      }))
    );
    return true;
  }

  if (requestUrl.pathname === "/api/agent-security") {
    sendJson(response, 200, await auditAgentConfiguration(projectPath));
    return true;
  }

  if (requestUrl.pathname === "/api/evaluations") {
    const reports = await listEvaluationReports(projectPath);
    sendJson(
      response,
      200,
      reports.map((report) => ({
        suiteId: report.suiteId,
        suiteName: report.suiteName,
        runId: report.runId,
        evaluatedAt: report.evaluatedAt,
        score: report.score,
        passed: report.passed,
        summary: report.summary,
        cases: report.cases.map((item) => ({
          caseId: item.caseId,
          agent: item.agent,
          score: item.score,
          passed: item.passed,
          status: item.status,
        })),
        judge: "judge" in report ? report.judge : null,
        judgedCases: "judgedCases" in report ? report.judgedCases : [],
      }))
    );
    return true;
  }

  if (requestUrl.pathname === "/api/benchmarks") {
    sendJson(response, 200, await listBenchmarks(projectPath));
    return true;
  }

  if (requestUrl.pathname === "/api/benchmark-matrices") {
    sendJson(response, 200, await listBenchmarkMatrices(projectPath));
    return true;
  }

  if (requestUrl.pathname === "/api/benchmark-regression") {
    const matrixId = requestUrl.searchParams.get("matrixId") ?? undefined;
    sendJson(response, 200, await loadBenchmarkRegression(projectPath, matrixId));
    return true;
  }

  if (requestUrl.pathname === "/api/experiment-history") {
    const matrices = await listBenchmarkMatrices(projectPath);
    const suiteId = requestUrl.searchParams.get("suite") ?? undefined;
    const candidateId = requestUrl.searchParams.get("candidate") ?? undefined;
    const report = buildExperimentHistory(matrices, {
      ...(suiteId ? { suiteId } : {}),
      ...(candidateId ? { candidateId } : {}),
      limit: 100,
    });
    sendJson(response, 200, report);
    return true;
  }

  if (requestUrl.pathname === "/api/agent-optimization") {
    const matrices = await listBenchmarkMatrices(projectPath);
    sendJson(response, 200, buildAgentOptimizationPlan(matrices));
    return true;
  }

  if (requestUrl.pathname === "/api/agent-performance") {
    const matrices = await listBenchmarkMatrices(projectPath);
    const latest = matrices.at(-1);
    const leaderboard = (latest?.agentSummary ?? [])
      .slice()
      .sort((a, b) => b.averageScore - a.averageScore || b.passRate - a.passRate);
    sendJson(response, 200, {
      matrixId: latest?.matrixId ?? null,
      matrixName: latest?.matrixName ?? null,
      createdAt: latest?.createdAt ?? null,
      agents: leaderboard,
    });
    return true;
  }

  if (requestUrl.pathname === "/api/agent-intelligence") {
    const matrices = await listBenchmarkMatrices(projectPath);
    const suiteId = requestUrl.searchParams.get("suite") ?? undefined;
    const candidateId = requestUrl.searchParams.get("candidate") ?? undefined;
    const rawLimit = requestUrl.searchParams.get("limit");
    const limit = rawLimit ? Number(rawLimit) : undefined;
    const report = buildAgentEvaluationIntelligence(matrices, {
      ...(suiteId ? { suiteId } : {}),
      ...(candidateId ? { candidateId } : {}),
      ...(limit !== undefined && Number.isSafeInteger(limit) ? { limit } : {}),
    });
    sendJson(response, 200, report);
    return true;
  }

  if (requestUrl.pathname === "/api/observability") {
    const runs = await listRuns(projectPath);
    const agents = new Map<
      string,
      {
        name: string;
        requests: number;
        successes: number;
        fallbacks: number;
        failures: number;
        inputTokensEstimate: number;
        outputTokensEstimate: number;
        durationMs: number;
        retries: number;
      }
    >();
    const providers = new Map<
      string,
      {
        name: string;
        requests: number;
        successes: number;
        fallbacks: number;
        failures: number;
        durationMs: number;
        retries: number;
      }
    >();
    const recent: Array<{ runId: string; createdAt: string; entries: unknown[] }> = [];
    for (const run of runs.slice(0, 30)) {
      try {
        const trace = await loadExecutionTrace(projectPath, run.id);
        recent.push({ runId: run.id, createdAt: trace.createdAt, entries: trace.entries.slice(-20) });
        for (const entry of trace.entries) {
          const agent = agents.get(entry.agent) ?? {
            name: entry.agent,
            requests: 0,
            successes: 0,
            fallbacks: 0,
            failures: 0,
            inputTokensEstimate: 0,
            outputTokensEstimate: 0,
            durationMs: 0,
            retries: 0,
          };
          agent.requests += 1;
          agent.successes += entry.outcome === "success" ? 1 : 0;
          agent.fallbacks += entry.outcome === "fallback" ? 1 : 0;
          agent.failures += entry.outcome === "failed" ? 1 : 0;
          agent.inputTokensEstimate += entry.inputTokensEstimate;
          agent.outputTokensEstimate += entry.outputTokensEstimate;
          agent.durationMs += entry.durationMs;
          agent.retries += entry.retries ?? 0;
          agents.set(entry.agent, agent);
          const provider = providers.get(entry.provider) ?? {
            name: entry.provider,
            requests: 0,
            successes: 0,
            fallbacks: 0,
            failures: 0,
            durationMs: 0,
            retries: 0,
          };
          provider.requests += 1;
          provider.successes += entry.outcome === "success" ? 1 : 0;
          provider.fallbacks += entry.outcome === "fallback" ? 1 : 0;
          provider.failures += entry.outcome === "failed" ? 1 : 0;
          provider.durationMs += entry.durationMs;
          provider.retries += entry.retries ?? 0;
          providers.set(entry.provider, provider);
        }
      } catch (error) {
        if (!isEnoent(error)) throw error;
      }
    }
    sendJson(response, 200, {
      generatedAt: new Date().toISOString(),
      runsScanned: runs.slice(0, 30).length,
      totals: {
        requests: [...agents.values()].reduce((n, a) => n + a.requests, 0),
        inputTokensEstimate: [...agents.values()].reduce((n, a) => n + a.inputTokensEstimate, 0),
        outputTokensEstimate: [...agents.values()].reduce((n, a) => n + a.outputTokensEstimate, 0),
        durationMs: [...agents.values()].reduce((n, a) => n + a.durationMs, 0),
        failures: [...agents.values()].reduce((n, a) => n + a.failures, 0),
        fallbacks: [...agents.values()].reduce((n, a) => n + a.fallbacks, 0),
      },
      agents: [...agents.values()].sort((a, b) => b.durationMs - a.durationMs),
      providers: [...providers.values()].sort((a, b) => b.requests - a.requests),
      budgets: {
        perAgentTokens: parseBudgetMap(process.env.ANVIL_MAX_ESTIMATED_TOKENS_PER_AGENT),
        perAgentDurationMs: parseBudgetMap(process.env.ANVIL_MAX_TASK_DURATION_MS_BY_AGENT),
        runTokens: Number(process.env.ANVIL_MAX_ESTIMATED_TOKENS_PER_RUN) || null,
        taskDurationMs: Number(process.env.ANVIL_MAX_TASK_DURATION_MS) || null,
      },
      recent,
    });
    return true;
  }

  const traceRoute = requestUrl.pathname.match(/^\/api\/runs\/([^/]+)\/trace$/);
  if (traceRoute) {
    try {
      const trace = await loadExecutionTrace(projectPath, decodeURIComponent(traceRoute[1]!));
      sendJson(response, 200, trace);
    } catch (error) {
      if (isEnoent(error)) {
        sendJson(response, 404, { error: "No execution trace has been saved for this run." });
        return true;
      }
      throw error;
    }
    return true;
  }

  if (requestUrl.pathname.startsWith("/api/runs/")) {
    const runId = decodeURIComponent(requestUrl.pathname.slice("/api/runs/".length));
    const run = await loadRun(projectPath, runId);
    sendJson(response, 200, {
      id: run.id,
      goal: run.goal,
      status: run.status,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      tasks: run.tasks.map((record) => ({
        id: record.task.id,
        title: record.task.title,
        agent: record.task.agent,
        status: record.status,
        dependsOn: record.task.dependsOn ?? [],
        result: record.result
          ? { provider: record.result.provider, model: record.result.model, content: record.result.content }
          : undefined,
        error: record.error,
        approval: record.approval,
      })),
      events: run.events.map((event) => ({
        at: event.at,
        taskId: event.taskId,
        type: event.type,
        message: event.message,
      })),
    });
    return true;
  }

  if (requestUrl.pathname === "/api/runs") {
    const runs = await listRuns(projectPath);
    sendJson(
      response,
      200,
      runs.map((run) => ({
        id: run.id,
        goal: run.goal,
        status: run.status,
        createdAt: run.createdAt,
        tasks: run.tasks.map((task) => ({
          id: task.task.id,
          title: task.task.title,
          agent: task.task.agent,
          status: task.status,
        })),
        events: run.events.map((event) => ({
          at: event.at,
          taskId: event.taskId,
          type: event.type,
          message: event.message,
        })),
      }))
    );
    return true;
  }

  if (requestUrl.pathname === "/api/health") {
    sendJson(response, 200, await generateProjectHealth(projectPath));
    return true;
  }

  if (requestUrl.pathname === "/api/quality") {
    const report = await auditProject(projectPath);
    sendJson(response, 200, {
      score: report.score,
      grade: report.grade,
      generatedAt: report.generatedAt,
      metrics: report.metrics,
      findings: report.findings.map((item) => ({
        id: item.id,
        severity: item.severity,
        title: item.title,
        recommendation: item.recommendation,
      })),
    });
    return true;
  }

  if (requestUrl.pathname === "/api/verifications") {
    const history = await listVerifications(projectPath, 25);
    sendJson(
      response,
      200,
      history.map((item) => ({
        id: item.id,
        script: item.script,
        status: item.status,
        exitCode: item.exitCode,
        durationMs: item.durationMs,
        startedAt: item.startedAt,
        finishedAt: item.finishedAt,
      }))
    );
    return true;
  }

  if (requestUrl.pathname === "/api/reviews") {
    const records = await listReviews(projectPath);
    sendJson(
      response,
      200,
      records.slice(0, 50).map((record) => ({
        id: record.id,
        createdAt: record.createdAt,
        scope: record.report.scope,
        filesReviewed: record.report.filesReviewed.length,
        staticFindings: record.report.findings.length,
        aiSuggestions: record.ai?.suggestions.length ?? 0,
        topFindings: [
          ...record.report.findings.slice(0, 3).map((item) => item.title),
          ...(record.ai?.suggestions.slice(0, 2).map((item) => item.title) ?? []),
        ],
      }))
    );
    return true;
  }

  if (requestUrl.pathname === "/api/regression") {
    const base = requestUrl.searchParams.get("base") ?? "HEAD";
    sendJson(response, 200, await generateRegressionReport(projectPath, base));
    return true;
  }

  if (requestUrl.pathname === "/api/search") {
    const query = requestUrl.searchParams.get("q") ?? "";
    const limit = Number(requestUrl.searchParams.get("limit") ?? 80);
    sendJson(response, 200, await searchWorkspace(projectPath, query, limit));
    return true;
  }

  if (requestUrl.pathname === "/api/workspace") {
    const relativePath = requestUrl.searchParams.get("path") ?? "";
    sendJson(response, 200, await listWorkspaceDirectory(projectPath, relativePath));
    return true;
  }

  if (requestUrl.pathname === "/api/workspace/file") {
    const relativePath = requestUrl.searchParams.get("path") ?? "";
    sendJson(response, 200, await readWorkspaceFile(projectPath, relativePath));
    return true;
  }

  if (requestUrl.pathname === "/api/dependency-intelligence") {
    sendJson(response, 200, await analyzeDependencies(projectPath));
    return true;
  }

  if (requestUrl.pathname === "/api/intelligence-timeline") {
    const [comparison, snapshots] = await Promise.all([
      compareLatestIntelligence(projectPath),
      listIntelligenceSnapshots(projectPath),
    ]);
    sendJson(response, 200, { comparison, snapshots });
    return true;
  }

  if (requestUrl.pathname === "/api/change-intelligence") {
    sendJson(response, 200, await analyzeChangeIntelligence(projectPath));
    return true;
  }

  if (requestUrl.pathname === "/api/engineering-risk") {
    sendJson(response, 200, await analyzeEngineeringRisk(projectPath));
    return true;
  }

  if (requestUrl.pathname === "/api/dependency-graph") {
    sendJson(response, 200, await buildDependencyGraph(projectPath));
    return true;
  }

  if (requestUrl.pathname === "/api/doctor") {
    sendJson(response, 200, await runDoctorChecks(projectPath));
    return true;
  }

  if (requestUrl.pathname === "/api/clean/preview") {
    sendJson(response, 200, await cleanProject(projectPath, { apply: false }));
    return true;
  }

  if (requestUrl.pathname === "/api/clean/snapshots") {
    const backupDirs = [path.join(projectPath, ANVIL_STATE_DIR, "backups")];
    const snapshots: Array<{ id: string; at: string; files: number }> = [];
    for (const dir of backupDirs) {
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name.startsWith("backup-")) {
            const manifestPath = path.join(dir, entry.name, "manifest.json");
            try {
              const raw = await readFile(manifestPath, "utf8");
              const data = JSON.parse(raw) as { timestamp?: string; files?: unknown[] };
              snapshots.push({
                id: entry.name,
                at: data.timestamp || new Date().toISOString(),
                files: Array.isArray(data.files) ? data.files.length : 0,
              });
            } catch {
              snapshots.push({ id: entry.name, at: new Date().toISOString(), files: 0 });
            }
          }
        }
      } catch {
        // Backup directory absent or unreadable.
      }
    }
    sendJson(response, 200, { snapshots: snapshots.sort((a, b) => b.at.localeCompare(a.at)) });
    return true;
  }

  if (requestUrl.pathname === "/api/memory") {
    sendJson(response, 200, { entries: await listProjectMemory(projectPath) });
    return true;
  }

  if (requestUrl.pathname === "/api/adrs") {
    sendJson(response, 200, { adrs: await listAdrs(projectPath) });
    return true;
  }

  if (requestUrl.pathname === "/api/security") {
    sendJson(response, 200, await scanProjectSecurity(projectPath));
    return true;
  }

  if (requestUrl.pathname === "/api/gate") {
    const since = requestUrl.searchParams.get("since") || undefined;
    const minConfidence = (requestUrl.searchParams.get("minConfidence") || undefined) as
      "high" | "medium" | "low" | undefined;
    const importSarif = requestUrl.searchParams.get("importSarif") || undefined;
    const externalSarifPaths = importSarif ? [importSarif] : undefined;
    const gateEvaluation = await evaluateGate(projectPath, {
      ...(since ? { since } : {}),
      ...(minConfidence ? { minConfidence } : {}),
      ...(externalSarifPaths ? { externalSarifPaths } : {}),
    });
    sendJson(response, 200, gateEvaluation);
    return true;
  }

  if (requestUrl.pathname === "/api/architecture") {
    sendJson(response, 200, await mapArchitecture(projectPath));
    return true;
  }

  if (requestUrl.pathname === "/api/catalog/agents") {
    const agents = await loadAgentRegistry(projectPath);
    sendJson(response, 200, { agents, total: agents.length });
    return true;
  }

  if (requestUrl.pathname === "/api/anvil/scorecard") {
    const card = await buildScorecard({ projectPath, anvilVersion: version.replace(/^v/, "") });
    sendJson(response, 200, card);
    return true;
  }

  if (requestUrl.pathname === "/api/catalog/skills") {
    const skills = await loadSkillRegistry(projectPath);
    sendJson(response, 200, { skills, total: skills.length });
    return true;
  }

  if (requestUrl.pathname === "/api/binary/assets") {
    sendJson(response, 200, await analyzeBinaryIntelligence(projectPath));
    return true;
  }

  if (requestUrl.pathname === "/api/supply-chain") {
    sendJson(response, 200, await scanSupplyChain(projectPath));
    return true;
  }

  if (requestUrl.pathname === "/api/call-graph") {
    const graph = await buildSymbolCallGraph(projectPath);
    const symbolQuery = requestUrl.searchParams.get("symbol")?.trim();
    const depth = Number(requestUrl.searchParams.get("depth") ?? "2");
    if (symbolQuery) {
      sendJson(response, 200, {
        ...graph,
        trace: querySymbolCallGraph(graph, symbolQuery, Number.isFinite(depth) ? depth : 2),
      });
    } else {
      sendJson(response, 200, graph);
    }
    return true;
  }

  if (requestUrl.pathname === "/api/cockpit/status") {
    const [skills, binaryReport, gateEval] = await Promise.all([
      loadSkillRegistry(projectPath).catch(() => []),
      analyzeBinaryIntelligence(projectPath).catch(() => null),
      evaluateGate(projectPath).catch(() => null),
    ]);
    sendJson(response, 200, {
      timestamp: new Date().toISOString(),
      cockpits: {
        combined: {
          ready: true,
          version: version.replace(/^v/, ""),
          status: "operational",
        },
        anvil: {
          gatePassed: gateEval?.passed ?? false,
          violations: gateEval?.violations?.length ?? 0,
          activeFindings: gateEval?.activeFindings?.length ?? 0,
        },
        catalog: {
          totalSkills: skills.length,
          builtinSkills: skills.filter((s) => s.source === "builtin").length,
          workspaceSkills: skills.filter((s) => s.source === "workspace").length,
        },
        binary: {
          totalAssets: binaryReport?.totalAssets ?? 0,
          cleanRoomCompliant: binaryReport?.cleanRoomReport?.compliant ?? true,
          findingsCount: binaryReport?.cleanRoomReport?.findings?.length ?? 0,
        },
        controlCenter: {
          status: "connected",
        },
      },
    });
    return true;
  }

  return false;
}
