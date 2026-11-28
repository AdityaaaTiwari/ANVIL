import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { saveBenchmarkMatrix } from "../src/core/benchmark-matrix.js";
import { handleDashboardGet } from "../src/core/dashboard/routes-get.js";
import { saveEvaluationReport, type JudgedEvaluationReport } from "../src/core/evaluation-engine.js";
import { saveExecutionTrace } from "../src/core/execution-trace.js";
import { createRun } from "../src/core/orchestrator.js";
import { saveRun } from "../src/core/run-store.js";
import { safeRm, trySymlink } from "./test-helpers.js";

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => safeRm(dir)));
});

async function invokeGet(
  urlPath: string,
  projectPath: string,
  pageHtml = "<html><body>ANVIL</body></html>",
  version = "v1.5.0"
): Promise<{ handled: boolean; statusCode: number; headers: Record<string, string>; body: string }> {
  const req = new EventEmitter() as unknown as IncomingMessage;
  let statusCode = 200;
  let headers: Record<string, string> = {};
  let body = "";
  const res = {
    writeHead(status: number, hdrs: Record<string, string> = {}) {
      statusCode = status;
      headers = hdrs;
      return res;
    },
    write(chunk: string | Buffer) {
      body += chunk.toString();
      return true;
    },
    end(chunk?: string | Buffer) {
      if (chunk !== undefined) body += chunk.toString();
      return res;
    },
  } as unknown as ServerResponse;

  const handled = await handleDashboardGet(
    req,
    res,
    new URL(`http://127.0.0.1:4173${urlPath}`),
    projectPath,
    pageHtml,
    version
  );
  if (urlPath === "/api/events") {
    req.emit("close");
  }
  return { handled, statusCode, headers, body };
}

describe("dashboard GET route handler", () => {
  it("handles /, /api/events, unknown routes, and /api/config-files errors and symlink checks", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "anvil-routes-get-"));
    tempDirs.push(root);
    const skillContent = "# Clean skill\nAlways verify.\n";
    await mkdir(path.join(root, ".anvil", "skills"), { recursive: true });
    await writeFile(path.join(root, ".anvil", "skills", "clean-skill.md"), skillContent);

    const home = await invokeGet("/", root, "<html>dashboard</html>");
    expect(home.handled).toBe(true);
    expect(home.statusCode).toBe(200);
    expect(home.body).toBe("<html>dashboard</html>");

    const sse = await invokeGet("/api/events", root);
    expect(sse.handled).toBe(true);
    expect(sse.headers["Content-Type"]).toBe("text/event-stream");
    expect(sse.body).toContain("event: connected");

    const missing = await invokeGet("/api/does-not-exist", root);
    expect(missing.handled).toBe(false);

    const skillList = await invokeGet("/api/config-files?category=skills", root);
    expect(JSON.parse(skillList.body)).toEqual([
      { category: "skills", id: "clean-skill", bytes: Buffer.byteLength(skillContent) },
    ]);

    await expect(invokeGet("/api/config-files?category=bad", root)).rejects.toThrow(/Choose agents or skills/);
    await expect(invokeGet("/api/config-files?id=bad..id", root)).rejects.toThrow(/Invalid configuration file ID/);
    await expect(invokeGet("/api/config-files?id=planner", root)).rejects.toThrow(/category is required/);
    await expect(invokeGet("/api/config-files?category=agents&id=missing", root)).rejects.toThrow();

    const outsideDir = path.join(root, "outside-agents");
    await mkdir(outsideDir, { recursive: true });
    await writeFile(path.join(outsideDir, "hacked.md"), "# Hacked");
    if (await trySymlink(outsideDir, path.join(root, ".anvil", "agents"), "dir")) {
      await expect(invokeGet("/api/config-files?category=agents", root)).rejects.toThrow(/symbolic links/);
      await expect(invokeGet("/api/config-files?category=agents&id=hacked", root)).rejects.toThrow(/symbolic links/);
    }
  });

  it("serves runs, traces, observability budgets, evaluations, clean snapshots, supply-chain, and call-graph", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "anvil-routes-data-"));
    tempDirs.push(root);
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(
      path.join(root, "src", "index.ts"),
      "export function leaf() { return 1; }\nexport function callerFn() { return leaf(); }\n"
    );

    const run = createRun("Dashboard coverage", [
      { id: "task-1", agent: "planner", title: "Plan", prompt: "Create plan" },
    ]);
    run.status = "completed";
    run.tasks[0]!.status = "completed";
    run.tasks[0]!.result = { provider: "openai", model: "gpt-4.1-mini", content: "Plan complete." };
    await saveRun(root, run);

    await saveExecutionTrace(root, run.id, [
      {
        taskId: "task-1",
        agent: "planner",
        tier: "fast",
        model: "gpt-4.1-mini",
        provider: "openai",
        startedAt: "2026-11-28T00:00:00.000Z",
        durationMs: 120,
        outcome: "success",
        inputTokensEstimate: 50,
        outputTokensEstimate: 25,
        retries: 1,
      },
    ]);

    const judgedReport: JudgedEvaluationReport = {
      version: 1,
      suiteId: "s1",
      suiteName: "Suite 1",
      runId: run.id,
      evaluatedAt: "2026-11-28T00:01:00.000Z",
      score: 100,
      passed: true,
      cases: [
        { caseId: "c1", taskId: "task-1", agent: "planner", status: "scored", score: 100, passed: true, criteria: [] },
      ],
      summary: { total: 1, scored: 1, passed: 1, missingOutput: 0 },
      judge: { provider: "openai", model: "gpt-4.1-mini", evaluatedCases: 1, averageScore: 95, passed: true },
      judgedCases: [
        {
          caseId: "c1",
          taskId: "task-1",
          agent: "planner",
          result: {
            provider: "openai",
            model: "gpt-4.1-mini",
            score: 95,
            rationale: "Good",
            strengths: ["Clear"],
            improvements: [],
            evidence: [{ quote: "Plan complete.", criterion: "c1" }],
          },
        },
      ],
    };
    await saveEvaluationReport(root, judgedReport);

    await saveBenchmarkMatrix(root, {
      version: 1,
      matrixId: "m1",
      matrixName: "Matrix 1",
      suiteId: "s1",
      goal: "Benchmark",
      createdAt: "2026-11-28T00:02:00.000Z",
      results: [
        {
          candidateId: "cand-1",
          provider: "openai",
          model: "gpt-4.1-mini",
          repeat: 1,
          runId: run.id,
          score: 95,
          passed: true,
          durationMs: 100,
          estimatedTokens: 75,
          status: "completed",
        },
      ],
      summary: [],
      agentSummary: [],
    });

    await mkdir(path.join(root, ".anvil", "backups", "backup-valid"), { recursive: true });
    await writeFile(
      path.join(root, ".anvil", "backups", "backup-valid", "manifest.json"),
      JSON.stringify({ timestamp: "2026-11-28T00:00:00.000Z", files: ["a.log", "b.log"] })
    );
    await mkdir(path.join(root, ".anvil", "backups", "backup-broken"), { recursive: true });
    await writeFile(path.join(root, ".anvil", "backups", "backup-broken", "manifest.json"), "{broken");

    const prevTokenMap = process.env.ANVIL_MAX_ESTIMATED_TOKENS_PER_AGENT;
    const prevDurationMap = process.env.ANVIL_MAX_TASK_DURATION_MS_BY_AGENT;
    process.env.ANVIL_MAX_ESTIMATED_TOKENS_PER_AGENT = '{"planner":5000,"bad":-1}';
    process.env.ANVIL_MAX_TASK_DURATION_MS_BY_AGENT = "not-json";
    try {
      const obs = await invokeGet("/api/observability", root);
      expect(obs.statusCode).toBe(200);
      const obsData = JSON.parse(obs.body);
      expect(obsData.totals.requests).toBe(1);
      expect(obsData.budgets.perAgentTokens).toEqual({ planner: 5000 });
      expect(obsData.budgets.perAgentDurationMs).toEqual({});
    } finally {
      if (prevTokenMap === undefined) delete process.env.ANVIL_MAX_ESTIMATED_TOKENS_PER_AGENT;
      else process.env.ANVIL_MAX_ESTIMATED_TOKENS_PER_AGENT = prevTokenMap;
      if (prevDurationMap === undefined) delete process.env.ANVIL_MAX_TASK_DURATION_MS_BY_AGENT;
      else process.env.ANVIL_MAX_TASK_DURATION_MS_BY_AGENT = prevDurationMap;
    }

    const traceOk = await invokeGet(`/api/runs/${run.id}/trace`, root);
    expect(traceOk.statusCode).toBe(200);
    expect(JSON.parse(traceOk.body).entries).toHaveLength(1);

    const traceMissing = await invokeGet("/api/runs/anvil-missing-trace/trace", root);
    expect(traceMissing.statusCode).toBe(404);

    const runDetail = await invokeGet(`/api/runs/${run.id}`, root);
    expect(runDetail.statusCode).toBe(200);
    expect(JSON.parse(runDetail.body).tasks[0].result.content).toBe("Plan complete.");

    const evalsRes = await invokeGet("/api/evaluations", root);
    expect(JSON.parse(evalsRes.body)[0].judge.averageScore).toBe(95);

    const agentIntel = await invokeGet("/api/agent-intelligence?suite=s1&candidate=cand-1&limit=5", root);
    expect(agentIntel.statusCode).toBe(200);

    const cleanPreview = await invokeGet("/api/clean/preview", root);
    expect(cleanPreview.statusCode).toBe(200);

    const snapshots = JSON.parse((await invokeGet("/api/clean/snapshots", root)).body).snapshots as Array<{
      id: string;
      files: number;
    }>;
    expect(snapshots.find((s) => s.id === "backup-valid")?.files).toBe(2);
    expect(snapshots.find((s) => s.id === "backup-broken")?.files).toBe(0);

    const supplyChain = await invokeGet("/api/supply-chain", root);
    expect(supplyChain.statusCode).toBe(200);

    const fullCallGraph = await invokeGet("/api/call-graph", root);
    expect(fullCallGraph.statusCode).toBe(200);
    const tracedCallGraph = await invokeGet("/api/call-graph?symbol=leaf&depth=2", root);
    expect(tracedCallGraph.statusCode).toBe(200);
    expect(JSON.parse(tracedCallGraph.body).trace).toBeDefined();
  });
});
