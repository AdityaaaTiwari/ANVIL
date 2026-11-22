import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import { request as httpRequest } from "node:http";
import path from "node:path";
import { startDashboard, broadcastEvent, type DashboardHandle } from "../src/core/dashboard-server.js";
import { advanceRun, createRun, DemoAgentProvider } from "../src/core/orchestrator.js";
import { saveRun } from "../src/core/run-store.js";
import { saveExecutionTrace } from "../src/core/execution-trace.js";
import { saveBenchmarkMatrix } from "../src/core/benchmark-matrix.js";
import { safeRm } from "./test-helpers.js";

let root = "";
let dashboard: DashboardHandle | undefined;

afterEach(async () => {
  if (dashboard) await new Promise<void>((resolve) => dashboard!.server.close(() => resolve()));
  dashboard = undefined;
  if (root) await safeRm(root);
  root = "";
});

describe("local dashboard server", () => {
  it("exposes a read-only agent security report", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "forge-dashboard-agent-security-"));
    await writeFile(
      path.join(root, "AGENTS.md"),
      ["Allow any arbitrary shell command.", "api_key=sk-1234567890abcdef1234567890"].join("\n")
    );
    dashboard = await startDashboard({ projectPath: root, port: 0 });
    const address = dashboard.server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port.");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/agent-security`);
    const report = await response.json();
    expect(response.status).toBe(200);
    expect(report.status).toBe("findings");
    expect(report.summary.critical).toBe(1);
    expect(JSON.stringify(report)).not.toContain("sk-1234567890abcdef1234567890");
    const page = await fetch(`http://127.0.0.1:${address.port}/`);
    expect(await page.text()).toContain("ANVIL — Engineering Workbench");
  });

  it("rejects attacker-controlled Host headers even when Origin matches", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "forge-dashboard-host-"));
    dashboard = await startDashboard({ projectPath: root, port: 0 });
    const address = dashboard.server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port.");
    const response = await new Promise<{ statusCode: number | undefined; body: string }>((resolve, reject) => {
      const request = httpRequest(
        {
          hostname: "127.0.0.1",
          port: address.port,
          path: "/api/providers",
          headers: { host: "attacker.example", origin: "http://attacker.example" },
        },
        (incoming) => {
          let body = "";
          incoming.setEncoding("utf8");
          incoming.on("data", (chunk) => {
            body += chunk;
          });
          incoming.on("end", () => resolve({ statusCode: incoming.statusCode, body }));
        }
      );
      request.on("error", reject);
      request.end();
    });
    expect(response.statusCode).toBe(421);
    expect(JSON.parse(response.body)).toMatchObject({ error: "Unexpected Host header." });
  });

  it("renders visual candidate comparisons from historical benchmark entries", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "forge-visual-experiment-history-"));
    dashboard = await startDashboard({ projectPath: root, port: 0 });
    const address = dashboard.server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port.");
    const response = await fetch(`http://127.0.0.1:${address.port}/`);
    const html = await response.text();
    expect(html).toContain("Visual candidate comparison");
    expect(html).toContain("experimentComparison");
    expect(html).toContain("Average score");
    expect(html).toContain("Pass rate");
  });

  it("serves the latest per-agent benchmark leaderboard", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "forge-agent-leaderboard-"));
    const now = new Date().toISOString();
    await saveBenchmarkMatrix(root, {
      version: 1,
      matrixId: "agent-matrix",
      matrixName: "Agent comparison",
      suiteId: "engineering-basics",
      goal: "Review reliability",
      createdAt: now,
      results: [
        {
          candidateId: "candidate-a",
          provider: "openai",
          model: "test-model",
          repeat: 1,
          runId: "forge-test",
          score: 88,
          passed: true,
          durationMs: 100,
          estimatedTokens: 50,
          status: "completed",
          agentScores: [
            { agent: "security-reviewer", caseId: "security", score: 88, passed: true, skillIds: ["secure-changes"] },
          ],
        },
      ],
      summary: [],
      agentSummary: [
        {
          candidateId: "candidate-a",
          provider: "openai",
          model: "test-model",
          agent: "security-reviewer",
          trials: 1,
          completed: 1,
          averageScore: 88,
          passRate: 100,
          skillsObserved: ["secure-changes"],
        },
      ],
    });
    dashboard = await startDashboard({ projectPath: root, port: 0 });
    const address = dashboard.server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port.");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/agent-performance`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.agents[0]).toMatchObject({ agent: "security-reviewer", averageScore: 88, passRate: 100 });
    expect(data.agents[0].skillsObserved).toContain("secure-changes");
  });

  it("reports provider readiness without exposing credential values", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "forge-provider-status-"));
    dashboard = await startDashboard({ projectPath: root, port: 0 });
    const address = dashboard.server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port.");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/providers`);
    expect(response.status).toBe(200);
    const providers = await response.json();
    expect(providers).toHaveLength(5);
    expect(providers.find((item: { id: string }) => item.id === "openai")).toMatchObject({
      id: "openai",
      status: "needs-credentials",
      configured: false,
      selected: true,
    });
    expect(JSON.stringify(providers)).not.toContain("sk-");
    expect(providers.every((item: { status: string }) => item.status !== "connected")).toBe(true);
    const previousBase = process.env.FORGE_BASE_URL;
    process.env.FORGE_BASE_URL = "https://user:private-token@example.test:9443/api?key=private-query";
    try {
      const refreshed = await fetch(`http://127.0.0.1:${address.port}/api/providers`);
      const refreshedProviders = await refreshed.json();
      expect(JSON.stringify(refreshedProviders)).not.toContain("private-token");
      expect(JSON.stringify(refreshedProviders)).not.toContain("private-query");
      expect(refreshedProviders.find((item: { id: string }) => item.id === "ollama").detail).toContain(
        "https://example.test:9443"
      );
    } finally {
      if (previousBase === undefined) delete process.env.FORGE_BASE_URL;
      else process.env.FORGE_BASE_URL = previousBase;
    }
  });

  it("runs an explicit provider diagnostic without requiring a credential to be echoed", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "forge-provider-diagnostic-route-"));
    dashboard = await startDashboard({ projectPath: root, port: 0 });
    const address = dashboard.server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port.");
    const names = ["FORGE_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY"] as const;
    const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    for (const name of names) delete process.env[name];
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/providers/openai/diagnose`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result).toMatchObject({ provider: "openai", status: "needs-credentials", modelAvailable: null });
      expect(JSON.stringify(result)).not.toContain("sk-");
    } finally {
      for (const name of names) {
        const value = previous[name];
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it("lists, reads and safely saves workspace agent and skill Markdown", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "forge-config-studio-"));
    await mkdir(path.join(root, ".forge", "agents"), { recursive: true });
    await mkdir(path.join(root, ".forge", "skills"), { recursive: true });
    await writeFile(path.join(root, ".forge", "agents", "planner.md"), "# Planner\\nPlan safely.\\n");
    dashboard = await startDashboard({ projectPath: root, port: 0 });
    const address = dashboard.server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port.");
    const base = `http://127.0.0.1:${address.port}`;
    const inventory = await fetch(base + "/api/config-files");
    expect(inventory.status).toBe(200);
    expect(await inventory.json()).toEqual([{ category: "agents", id: "planner", bytes: 25 }]);
    const read = await fetch(base + "/api/config-files?category=agents&id=planner");
    expect((await read.json()).content).toContain("Plan safely");
    const saved = await fetch(base + "/api/config-files", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        category: "skills",
        id: "api-safety",
        content: "# API safety\\nValidate every boundary.\\n",
      }),
    });
    expect(saved.status).toBe(200);
    expect((await saved.json()).id).toBe("api-safety");
    const invalid = await fetch(base + "/api/config-files", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: "agents", id: "../escape", content: "# Nope" }),
    });
    expect(invalid.status).toBe(500);
    expect(await readFile(path.join(root, ".forge", "skills", "api-safety.md"), "utf8")).toContain(
      "Validate every boundary"
    );
    const snapshot = await fetch(base + "/api/config-snapshots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: "dashboard studio test" }),
    });
    expect(snapshot.status).toBe(201);
    const version = await snapshot.json();
    expect(version.status).toBe("candidate");
    expect(version.files).toHaveLength(4);
    const bypassApproval = await fetch(base + "/api/config-snapshots/" + version.id + "/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reviewer: "test-reviewer" }),
    });
    expect(bypassApproval.status).toBe(405);
    const versions = await fetch(base + "/api/config-snapshots");
    expect((await versions.json())[0].status).toBe("candidate");
    const releases = await fetch(base + "/api/config-releases");
    expect(releases.status).toBe(200);
    expect(await releases.json()).toEqual([]);
  });

  it("serves the dashboard and read-only project APIs on loopback", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "forge-dashboard-"));
    dashboard = await startDashboard({ projectPath: root, port: 0 });
    const address = dashboard.server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port.");
    const base = `http://127.0.0.1:${address.port}`;

    const page = await fetch(base);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("ANVIL");
    expect(html).toContain("Agent handoff map");
    expect(html).toContain("Execution telemetry");
    expect(html).toContain("Agent observability");
    expect(html).toContain("Per-agent utilization");
    expect(html).toContain("Provider health");
    expect(html).toContain("Agent Performance");
    expect(html).toContain("Skill Experiments");
    expect(html).toContain("Experiment History & Leaderboard");
    expect(html).toContain("experimentLeaderboard");
    expect(html).toContain("exportExperimentHistory");
    expect(html).toContain("Adaptive Agent Recommendations");
    expect(html).toContain("Per-agent scorecards");
    expect(html).toContain("Evaluation history");
    expect(html).toContain("Live event stream");
    expect(html).toContain("Create replay of retryable tasks");
    expect(html).toContain("Compare with previous run");
    expect(html).toContain("Cancel run");
    expect(html).toContain("Retry this task and blocked dependants");
    expect(html).toContain("Project Memory & Architectural Decisions");

    const initialMemory = await fetch(base + "/api/memory");
    expect(initialMemory.status).toBe(200);
    expect((await initialMemory.json()).entries).toBeDefined();

    const addMem = await fetch(base + "/api/memory", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "decision", content: "Always use Vitest", tags: ["testing"] }),
    });
    expect(addMem.status).toBe(201);
    const added = await addMem.json();
    expect(added.id).toMatch(/^mem-/);
    expect(added.content).toBe("Always use Vitest");

    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "src", "demo.ts"), "export const demo = true;\\n");
    await writeFile(path.join(root, ".env"), "SECRET=hidden");
    const workspace = await fetch(base + "/api/workspace");
    expect(workspace.status).toBe(200);
    const workspaceListing = await workspace.json();
    expect(workspaceListing.entries.some((item: { name: string }) => item.name === "src")).toBe(true);
    expect(workspaceListing.entries.some((item: { name: string }) => item.name === ".env")).toBe(false);
    const preview = await fetch(base + "/api/workspace/file?path=src%2Fdemo.ts");
    expect(preview.status).toBe(200);
    expect((await preview.json()).content).toContain("demo = true");
    const traversal = await fetch(base + "/api/workspace?path=..");
    expect(traversal.status).toBe(500);

    const overview = await fetch(base + "/api/overview");
    expect(overview.status).toBe(200);
    expect((await overview.json()).runCount).toBe(0);

    const health = await fetch(base + "/api/health");
    expect(health.status).toBe(200);
    const healthReport = await health.json();
    expect(typeof healthReport.current.quality.score).toBe("number");
    expect(Array.isArray(healthReport.history)).toBe(true);

    const quality = await fetch(base + "/api/quality");
    expect(quality.status).toBe(200);
    const qualityReport = await quality.json();
    expect(typeof qualityReport.score).toBe("number");
    expect(Array.isArray(qualityReport.findings)).toBe(true);

    const regression = await fetch(base + "/api/regression");
    expect(regression.status).toBe(200);
    const regressionReport = await regression.json();
    expect(regressionReport.summary).toHaveProperty("regressions");
    expect(Array.isArray(regressionReport.checks)).toBe(true);

    const reviews = await fetch(base + "/api/reviews");
    expect(reviews.status).toBe(200);
    expect(Array.isArray(await reviews.json())).toBe(true);

    const verifications = await fetch(base + "/api/verifications");
    expect(verifications.status).toBe(200);
    expect(Array.isArray(await verifications.json())).toBe(true);
    const dependencyIntelResponse = await fetch(base + "/api/dependency-intelligence");
    expect(dependencyIntelResponse.status).toBe(200);
    const dependencyIntel = await dependencyIntelResponse.json();
    expect(dependencyIntel.summary).toHaveProperty("direct");
    expect(dependencyIntel.sources.vulnerabilityReport).toBeNull();
    const timelineResponse = await fetch(base + "/api/intelligence-timeline");
    expect(timelineResponse.status).toBe(200);
    const timeline = await timelineResponse.json();
    expect(timeline.comparison).toBeNull();
    expect(timeline.snapshots).toEqual([]);
    const changeRiskResponse = await fetch(base + "/api/change-intelligence");
    expect(changeRiskResponse.status).toBe(200);
    const changeRiskReport = await changeRiskResponse.json();
    expect(changeRiskReport.summary).toHaveProperty("changedFiles");
    expect(Array.isArray(changeRiskReport.changes)).toBe(true);
    const riskReportResponse = await fetch(base + "/api/engineering-risk");
    expect(riskReportResponse.status).toBe(200);
    const riskReport = await riskReportResponse.json();
    expect(Array.isArray(riskReport.hotspots)).toBe(true);
    expect(riskReport.summary).toHaveProperty("high");
    const dependencyGraph = await fetch(base + "/api/dependency-graph");
    expect(dependencyGraph.status).toBe(200);
    const dependencyReport = await dependencyGraph.json();
    expect(Array.isArray(dependencyReport.nodes)).toBe(true);
    expect(Array.isArray(dependencyReport.edges)).toBe(true);
    expect(dependencyReport.summary).toHaveProperty("undeclared");
    const architecture = await fetch(base + "/api/architecture");
    expect(architecture.status).toBe(200);
    const graph = await architecture.json();
    expect(Array.isArray(graph.nodes)).toBe(true);
    expect(Array.isArray(graph.edges)).toBe(true);

    const runs = await fetch(base + "/api/runs");
    expect(runs.status).toBe(200);
    const runList = await runs.json();
    expect(Array.isArray(runList)).toBe(true);
    if (runList[0]) {
      expect(runList[0].tasks[0]).toHaveProperty("status");
      expect(runList[0]).toHaveProperty("events");
      expect(runList[0].tasks[0]).not.toHaveProperty("prompt");
    }

    const runDetail = await fetch(base + "/api/runs/forge-not-found");
    expect(runDetail.status).toBe(500);

    const evaluations = await fetch(base + "/api/evaluations");
    expect(evaluations.status).toBe(200);
    expect(await evaluations.json()).toEqual([]);
    const benchmarks = await fetch(base + "/api/benchmarks");
    expect(benchmarks.status).toBe(200);
    expect(await benchmarks.json()).toEqual([]);
    const benchmarkMatrices = await fetch(base + "/api/benchmark-matrices");
    expect(benchmarkMatrices.status).toBe(200);
    expect(await benchmarkMatrices.json()).toEqual([]);
    const benchmarkRegression = await fetch(base + "/api/benchmark-regression");
    expect(benchmarkRegression.status).toBe(200);
    expect((await benchmarkRegression.json()).status).toBe("insufficient-history");
    const optimization = await fetch(base + "/api/agent-optimization");
    expect(optimization.status).toBe(200);
    expect((await optimization.json()).status).toBe("insufficient-history");
    const experimentHistory = await fetch(base + "/api/experiment-history");
    expect(experimentHistory.status).toBe(200);
    const experimentReport = await experimentHistory.json();
    expect(experimentReport.entries).toEqual([]);
    expect(experimentReport).toHaveProperty("reportsAnalyzed", 0);
    const filteredExperimentHistory = await fetch(
      base + "/api/experiment-history?suite=engineering-basics&candidate=missing"
    );
    expect(filteredExperimentHistory.status).toBe(200);
    expect((await filteredExperimentHistory.json()).entries).toEqual([]);

    const agentPerformance = await fetch(base + "/api/agent-performance");
    expect(agentPerformance.status).toBe(200);
    expect((await agentPerformance.json()).agents).toEqual([]);

    const agentIntelligence = await fetch(base + "/api/agent-intelligence");
    expect(agentIntelligence.status).toBe(200);
    expect((await agentIntelligence.json()).status).toBe("insufficient-data");

    const observability = await fetch(base + "/api/observability");
    expect(observability.status).toBe(200);
    const telemetry = await observability.json();
    expect(telemetry).toHaveProperty("totals");
    expect(Array.isArray(telemetry.agents)).toBe(true);
    expect(Array.isArray(telemetry.providers)).toBe(true);
    expect(telemetry.budgets).toHaveProperty("perAgentTokens");

    const agents = await fetch(base + "/api/agents");
    expect(agents.status).toBe(200);
    const agentList = await agents.json();
    expect(agentList.some((agent: { id: string }) => agent.id === "planner")).toBe(true);
    expect(agentList[0]).not.toHaveProperty("instructions");

    const forbidden = await fetch(base + "/api/overview", { method: "POST" });
    expect(forbidden.status).toBe(405);

    const workflowResponse = await fetch(base + "/api/workflows", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "dashboard-flow",
        name: "Dashboard flow",
        description: "Test pipeline",
        tasks: [
          { id: "plan", agent: "planner", title: "Plan", prompt: "Create a plan." },
          {
            id: "review",
            agent: "code-reviewer",
            title: "Review",
            prompt: "Review the plan.",
            dependsOn: ["plan"],
            requiresApproval: true,
          },
        ],
      }),
    });
    expect(workflowResponse.status).toBe(201);
    const savedWorkflow = await workflowResponse.json();
    expect(savedWorkflow.id).toBe("dashboard-flow");
    const workflowListResponse = await fetch(base + "/api/workflows");
    expect((await workflowListResponse.json()).some((item: { id: string }) => item.id === "dashboard-flow")).toBe(true);
    const workflowRunResponse = await fetch(base + "/api/workflows/dashboard-flow/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(workflowRunResponse.status).toBe(201);
    const workflowRun = await workflowRunResponse.json();
    expect(workflowRun.taskCount).toBe(2);
    const createdDraft = await fetch(base + "/api/runs/" + workflowRun.id);
    const createdDraftJson = await createdDraft.json();
    expect(createdDraftJson.status).toBe("pending");
    expect(createdDraftJson.tasks[1].dependsOn).toEqual(["plan"]);

    const pendingRun = await advanceRun(
      createRun("Review a release", [
        {
          id: "review",
          agent: "reviewer",
          title: "Review release",
          prompt: "Review the proposed release",
          requiresApproval: true,
        },
      ]),
      new DemoAgentProvider()
    );
    await saveRun(root, pendingRun);
    const approval = await fetch(base + "/api/runs/" + pendingRun.id + "/tasks/review/approval", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId: "review", decision: "approved", reviewer: "test-reviewer" }),
    });
    expect(approval.status).toBe(200);
    const approvalResult = await approval.json();
    expect(approvalResult.task.approval.decision).toBe("approved");
    expect(approvalResult.task.approval.reviewer).toBe("test-reviewer");

    const failedRun = createRun("Recover failed task", [
      { id: "retry-me", agent: "planner", title: "Retry me", prompt: "Try again" },
    ]);
    failedRun.status = "failed";
    failedRun.tasks[0]!.status = "failed";
    failedRun.tasks[0]!.error = "Temporary provider failure";
    await saveRun(root, failedRun);
    const replayResponse = await fetch(base + "/api/runs/" + failedRun.id + "/replay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(replayResponse.status).toBe(201);
    const replayResult = await replayResponse.json();
    expect(replayResult.sourceRunId).toBe(failedRun.id);
    const replayDetail = await fetch(base + "/api/runs/" + replayResult.id);
    const replayJson = await replayDetail.json();
    expect(replayJson.tasks[0].status).toBe("pending");

    const cancelResponse = await fetch(base + "/api/runs/" + pendingRun.id + "/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(cancelResponse.status).toBe(200);
    const cancelledDetail = await fetch(base + "/api/runs/" + pendingRun.id);
    expect((await cancelledDetail.json()).status).toBe("cancelled");

    const retrySource = createRun("Retry one task", [
      { id: "done", agent: "architect", title: "Done", prompt: "Done" },
      { id: "broken", agent: "reviewer", title: "Broken", prompt: "Broken", dependsOn: ["done"] },
      { id: "next", agent: "planner", title: "Next", prompt: "Next", dependsOn: ["broken"] },
    ]);
    retrySource.tasks[0]!.status = "completed";
    retrySource.tasks[0]!.result = { provider: "test", content: "kept" };
    retrySource.tasks[1]!.status = "failed";
    retrySource.tasks[2]!.status = "blocked";
    await saveRun(root, retrySource);
    const taskRetryResponse = await fetch(base + "/api/runs/" + retrySource.id + "/tasks/broken/retry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(taskRetryResponse.status).toBe(201);
    const taskRetry = await taskRetryResponse.json();
    const taskRetryDetail = await fetch(base + "/api/runs/" + taskRetry.id);
    expect((await taskRetryDetail.json()).tasks.map((task: { status: string }) => task.status)).toEqual([
      "completed",
      "pending",
      "pending",
    ]);

    const detail = await fetch(base + "/api/runs/" + pendingRun.id);
    const detailResult = await detail.json();
    expect(detailResult.tasks[0].approval.decision).toBe("approved");
    const handoffRun = createRun("Inspect agent handoffs", [
      { id: "architect", agent: "architect", title: "Map architecture", prompt: "Map" },
      { id: "reviewer", agent: "reviewer", title: "Review map", prompt: "Review", dependsOn: ["architect"] },
    ]);
    await saveRun(root, handoffRun);
    const handoffDetail = await fetch(base + "/api/runs/" + handoffRun.id);
    const handoffJson = await handoffDetail.json();
    expect(handoffJson.tasks[1].dependsOn).toEqual(["architect"]);
    await saveExecutionTrace(root, handoffRun.id, [
      {
        taskId: "architect",
        agent: "architect",
        tier: "reasoning",
        model: "test-model",
        provider: "test-provider",
        startedAt: new Date().toISOString(),
        durationMs: 42,
        outcome: "success",
        inputTokensEstimate: 20,
        outputTokensEstimate: 10,
      },
    ]);
    const traceResponse = await fetch(base + "/api/runs/" + handoffRun.id + "/trace");
    expect(traceResponse.status).toBe(200);
    const traceJson = await traceResponse.json();
    expect(traceJson.entries[0].model).toBe("test-model");
    expect(traceJson.totals.durationMs).toBe(42);
    const missingTrace = await fetch(base + "/api/runs/" + pendingRun.id + "/trace");
    expect(missingTrace.status).toBe(404);
  });

  it("does not serve unknown routes", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "forge-dashboard-"));
    dashboard = await startDashboard({ projectPath: root, port: 0 });
    const address = dashboard.server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port.");
    const response = await fetch(`http://127.0.0.1:${address.port}/unknown`);
    expect(response.status).toBe(404);
  });

  it("SSE endpoint returns text/event-stream and writes an initial connected event", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "forge-sse-connect-"));
    dashboard = await startDashboard({ projectPath: root, port: 0 });
    const address = dashboard.server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port.");
    const received = await new Promise<string>((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: "127.0.0.1",
          port: address.port,
          path: "/api/events",
          headers: { accept: "text/event-stream" },
        },
        (incoming) => {
          expect(incoming.headers["content-type"]).toContain("text/event-stream");
          let buf = "";
          incoming.on("data", (chunk: Buffer) => {
            buf += chunk.toString();
            if (buf.includes("event: connected")) {
              incoming.destroy();
              resolve(buf);
            }
          });
          incoming.on("error", () => resolve(buf));
        }
      );
      req.on("error", reject);
      req.end();
    });
    expect(received).toContain("event: connected");
    expect(received).toContain("retry: 3000");
  });

  it("broadcastEvent sends data to all active SSE clients", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "forge-sse-broadcast-"));
    dashboard = await startDashboard({ projectPath: root, port: 0 });
    const address = dashboard.server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port.");

    // Connect a client and wait for the initial "connected" event before broadcasting
    const received = await new Promise<string>((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: "127.0.0.1",
          port: address.port,
          path: "/api/events",
          headers: { accept: "text/event-stream" },
        },
        (incoming) => {
          let buf = "";
          incoming.on("data", (chunk: Buffer) => {
            buf += chunk.toString();
            if (buf.includes("event: connected")) {
              // Once connected, broadcast a custom event
              broadcastEvent("test-broadcast", { hello: "world" });
            }
            if (buf.includes("event: test-broadcast")) {
              incoming.destroy();
              resolve(buf);
            }
          });
          incoming.on("error", () => resolve(buf));
        }
      );
      req.on("error", reject);
      req.end();
    });
    expect(received).toContain("event: test-broadcast");
    expect(received).toContain('"hello":"world"');
  });

  it("serves and manages Architecture Decision Records via /api/adrs and /api/adrs/sync", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "forge-dashboard-adrs-"));
    dashboard = await startDashboard({ projectPath: root, port: 0 });
    const address = dashboard.server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port.");

    // Create an ADR
    const postRes = await fetch(`http://127.0.0.1:${address.port}/api/adrs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Adopt Local-First Storage", status: "Accepted" }),
    });
    expect(postRes.status).toBe(201);
    const created = await postRes.json();
    expect(created.title).toBe("Adopt Local-First Storage");

    // List ADRs
    const getRes = await fetch(`http://127.0.0.1:${address.port}/api/adrs`);
    expect(getRes.status).toBe(200);
    const { adrs } = await getRes.json();
    expect(adrs.length).toBeGreaterThanOrEqual(1);
    expect(adrs[0].title).toBe("Adopt Local-First Storage");

    // Sync ADRs
    const syncRes = await fetch(`http://127.0.0.1:${address.port}/api/adrs/sync`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(syncRes.status).toBe(200);
    const syncData = await syncRes.json();
    expect(syncData).toHaveProperty("syncedCount");
  });

  it("serves security audit and auto-fixes file exclusions via /api/security and /api/security/fix", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "forge-dashboard-security-"));
    await writeFile(path.join(root, ".env"), "EXPOSED_SECRET=abcdef9876543210\n");
    dashboard = await startDashboard({ projectPath: root, port: 0 });
    const address = dashboard.server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port.");

    // Query security audit
    const getRes = await fetch(`http://127.0.0.1:${address.port}/api/security`);
    expect(getRes.status).toBe(200);
    const report = await getRes.json();
    expect(report.findings.length).toBeGreaterThanOrEqual(1);

    // Apply auto-fix
    const fixRes = await fetch(`http://127.0.0.1:${address.port}/api/security/fix`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(fixRes.status).toBe(200);
    const fixData = await fixRes.json();
    expect(fixData.fixedCount).toBeGreaterThan(0);
  });

  it("executes multi-agent workflows live and streams results via /api/workflows/:id/execute", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "forge-dashboard-workflow-exec-"));
    dashboard = await startDashboard({ projectPath: root, port: 0 });
    const address = dashboard.server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port.");

    // Save a workflow
    const saveRes = await fetch(`http://127.0.0.1:${address.port}/api/workflows`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "pipeline-live-test",
        name: "Pipeline Live Test",
        description: "Test execution of multi-agent pipeline",
        tasks: [
          { id: "task-1", agent: "planner", title: "Create Plan", prompt: "Formulate task plan" },
          {
            id: "task-2",
            agent: "code-reviewer",
            title: "Review Code",
            prompt: "Inspect boundaries",
            dependsOn: ["task-1"],
          },
        ],
      }),
    });
    expect(saveRes.status).toBe(201);

    // Execute the saved workflow live
    const execRes = await fetch(`http://127.0.0.1:${address.port}/api/workflows/pipeline-live-test/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(execRes.status).toBe(200);
    const execData = await execRes.json();
    expect(execData.status).toBe("completed");
    expect(execData.taskCount).toBe(2);
    expect(execData.tasks[0].status).toBe("completed");
    expect(execData.tasks[0].result).toBeDefined();
    expect(execData.tasks[1].status).toBe("completed");
  });

  it("serves policy-as-code gate evaluation via /api/gate", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "forge-dashboard-gate-"));
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "clean.ts"), "export const value = 42;\n");
    dashboard = await startDashboard({ projectPath: root, port: 0 });
    const address = dashboard.server.address();
    if (!address || typeof address === "string") throw new Error("Dashboard did not bind a TCP port.");

    const res = await fetch(`http://127.0.0.1:${address.port}/api/gate`);
    expect(res.status).toBe(200);
    const evaluation = await res.json();
    expect(typeof evaluation.passed).toBe("boolean");
    expect(evaluation.summary).toBeDefined();
    expect(typeof evaluation.summary.critical).toBe("number");
    expect(typeof evaluation.summary.suppressedByBaseline).toBe("number");
    expect(Array.isArray(evaluation.activeFindings)).toBe(true);
    expect(Array.isArray(evaluation.violations)).toBe(true);
    expect(Array.isArray(evaluation.warnings)).toBe(true);

    const resFiltered = await fetch(`http://127.0.0.1:${address.port}/api/gate?minConfidence=high`);
    expect(resFiltered.status).toBe(200);
    const filteredEvaluation = await resFiltered.json();
    expect(typeof filteredEvaluation.passed).toBe("boolean");

    const page = await fetch(`http://127.0.0.1:${address.port}/`);
    const html = await page.text();
    expect(html).toContain("tab-gate");
    expect(html).toContain("Policy & Gate");
    expect(html).toContain("Empirical Measured Token Footprint Benchmark");
    expect(html).toContain("GitHub Community, CI Gate & Achievements");
    expect(html).toContain("gateScanMode");
    expect(html).toContain("gateMinConfidence");
  });
});
