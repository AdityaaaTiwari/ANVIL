import { mkdir, lstat, realpath, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { createAdr, syncMemoryToAdrs, type AdrStatus } from "../adr-engine.js";
import { decideAgentConfigRelease, prepareAgentConfigRelease } from "../agent-config-release.js";
import { captureAgentConfigVersion } from "../agent-config-versioning.js";
import { loadBenchmarkRegression } from "../benchmark-regression.js";
import { advanceRun, DemoAgentProvider } from "../orchestrator.js";
import { cleanProject, undoLastClean } from "../project-cleaner.js";
import { addProjectMemory, removeProjectMemory } from "../project-memory.js";
import { diagnoseProvider, type DiagnosableProvider } from "../provider-diagnostics.js";
import { createReplayRun, createTaskRetryRun } from "../run-replay.js";
import { decideTaskApproval, loadRun, saveRun } from "../run-store.js";
import { applySecurityFixes, scanProjectSecurity } from "../security-scanner.js";
import { createRunFromWorkflow, loadWorkflow, saveWorkflow } from "../workflow-store.js";
import { ANVIL_STATE_DIR } from "../workspace-paths.js";
import { handleAppUpload } from "./app-routes.js";
import { readJsonBody, rejectDisallowedPostHeaders, sendJson } from "./http-helpers.js";
import { broadcastEvent } from "./sse.js";

function isStandardDashboardPostPath(pathname: string): boolean {
  return (
    pathname === "/api/memory" ||
    pathname === "/api/memory/delete" ||
    pathname === "/api/adrs" ||
    pathname === "/api/adrs/sync" ||
    pathname === "/api/security/fix" ||
    pathname === "/api/workflows" ||
    pathname === "/api/clean/run" ||
    pathname === "/api/clean/undo" ||
    pathname === "/api/config-files" ||
    pathname === "/api/config-snapshots" ||
    /^\/api\/providers\/(?:openai|anthropic|google|ollama)\/diagnose$/.test(pathname) ||
    pathname === "/api/config-releases" ||
    /^\/api\/config-releases\/rel-[a-f0-9]{12}\/(?:approve|reject)$/.test(pathname) ||
    (pathname.endsWith("/run") && pathname.startsWith("/api/workflows/")) ||
    (pathname.endsWith("/execute") && pathname.startsWith("/api/workflows/")) ||
    /^\/api\/runs\/[^/]+\/(?:replay|cancel)$/.test(pathname) ||
    /^\/api\/runs\/[^/]+\/tasks\/[^/]+\/retry$/.test(pathname)
  );
}

/**
 * Handles POST requests for the local ANVIL dashboard.
 * Returns `true` if a response was sent, or `false` if unhandled.
 */
export async function handleDashboardPost(
  request: IncomingMessage,
  response: ServerResponse,
  requestUrl: URL,
  projectPath: string
): Promise<boolean> {
  if (requestUrl.pathname === "/api/app/upload") {
    await handleAppUpload(request, response);
    return true;
  }

  if (isStandardDashboardPostPath(requestUrl.pathname)) {
    if (rejectDisallowedPostHeaders(request, response)) return true;
    const maxBytes = requestUrl.pathname === "/api/config-files" ? 140000 : 16384;
    const parsed = await readJsonBody(request, response, maxBytes);
    if (!parsed.ok) return true;
    const body = parsed.body;

    const providerDiagnosticRoute = requestUrl.pathname.match(
      /^\/api\/providers\/(openai|anthropic|google|ollama)\/diagnose$/
    );
    if (providerDiagnosticRoute) {
      const diagnostic = await diagnoseProvider(providerDiagnosticRoute[1] as DiagnosableProvider);
      sendJson(response, 200, diagnostic);
      return true;
    }

    if (requestUrl.pathname === "/api/config-releases") {
      const input = body as { candidateVersionId?: unknown; baselineVersionId?: unknown; matrixId?: unknown };
      if (
        typeof input?.candidateVersionId !== "string" ||
        typeof input.baselineVersionId !== "string" ||
        typeof input.matrixId !== "string" ||
        !input.matrixId.trim()
      ) {
        throw new Error("Candidate, baseline and benchmark matrix IDs are required.");
      }
      const regression = await loadBenchmarkRegression(projectPath, input.matrixId);
      const release = await prepareAgentConfigRelease(projectPath, {
        candidateVersionId: input.candidateVersionId,
        baselineVersionId: input.baselineVersionId,
        regression,
      });
      sendJson(response, 201, release);
      return true;
    }

    const releaseDecision = requestUrl.pathname.match(/^\/api\/config-releases\/(rel-[a-f0-9]{12})\/(approve|reject)$/);
    if (releaseDecision) {
      const input = body as { reviewer?: unknown };
      if (typeof input?.reviewer !== "string" || !input.reviewer.trim() || input.reviewer.length > 80) {
        throw new Error("Reviewer label must contain 1–80 characters.");
      }
      const release = await decideAgentConfigRelease(
        projectPath,
        releaseDecision[1]!,
        input.reviewer.trim(),
        releaseDecision[2] as "approve" | "reject"
      );
      sendJson(response, 200, release);
      return true;
    }

    if (requestUrl.pathname === "/api/config-snapshots") {
      const input = body as { note?: unknown };
      if (input?.note !== undefined && typeof input.note !== "string") {
        throw new Error("Snapshot note must be text.");
      }
      const version = await captureAgentConfigVersion(projectPath, {
        note: typeof input.note === "string" ? input.note : "",
      });
      sendJson(response, 201, {
        id: version.id,
        status: version.status,
        files: version.files.map((file) => ({ path: file.path, sha256: file.sha256 })),
        createdAt: version.createdAt,
      });
      return true;
    }

    if (requestUrl.pathname === "/api/config-files") {
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new Error("Invalid configuration payload.");
      }
      const input = body as { category?: unknown; id?: unknown; content?: unknown };
      if (input.category !== "agents" && input.category !== "skills") throw new Error("Choose agents or skills.");
      if (typeof input.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(input.id)) {
        throw new Error("File ID must be a lowercase slug (letters, numbers and hyphens).");
      }
      if (
        typeof input.content !== "string" ||
        !input.content.trim() ||
        Buffer.byteLength(input.content, "utf8") > 128 * 1024 ||
        input.content.includes("\0")
      ) {
        throw new Error("Markdown content must be non-empty and at most 128 KiB.");
      }
      const root = path.resolve(projectPath);
      const stateDirectory = path.join(root, ANVIL_STATE_DIR);
      const directory = path.join(stateDirectory, input.category);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const realRoot = await realpath(root);
      const realState = await realpath(stateDirectory);
      const realDirectory = await realpath(directory);
      if (
        realState !== path.join(realRoot, ANVIL_STATE_DIR) ||
        realDirectory !== path.join(realState, input.category)
      ) {
        throw new Error("Configuration directories must not be symbolic links.");
      }
      const file = path.join(directory, `${input.id}.md`);
      try {
        if ((await lstat(file)).isSymbolicLink()) {
          throw new Error("Configuration file must not be a symbolic link.");
        }
      } catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
      }
      await writeFile(file, input.content, { encoding: "utf8", mode: 0o600 });
      sendJson(response, 200, {
        category: input.category,
        id: input.id,
        bytes: Buffer.byteLength(input.content, "utf8"),
      });
      return true;
    }

    const cancelRoute = requestUrl.pathname.match(/^\/api\/runs\/([^/]+)\/cancel$/);
    if (cancelRoute) {
      const run = await loadRun(projectPath, decodeURIComponent(cancelRoute[1]!));
      if (["completed", "failed", "cancelled"].includes(run.status)) {
        sendJson(response, 409, { error: "This run is already terminal." });
        return true;
      }
      run.status = "cancelled";
      run.updatedAt = new Date().toISOString();
      run.events.push({
        at: run.updatedAt,
        taskId: "*",
        type: "blocked",
        message: "Cancellation requested from the dashboard. Active provider calls may finish before the run stops.",
      });
      await saveRun(projectPath, run);
      sendJson(response, 200, { id: run.id, status: run.status });
      return true;
    }

    const retryRoute = requestUrl.pathname.match(/^\/api\/runs\/([^/]+)\/tasks\/([^/]+)\/retry$/);
    if (retryRoute) {
      const source = await loadRun(projectPath, decodeURIComponent(retryRoute[1]!));
      const retry = createTaskRetryRun(source, decodeURIComponent(retryRoute[2]!));
      await saveRun(projectPath, retry);
      sendJson(response, 201, { id: retry.id, status: retry.status, sourceRunId: source.id });
      return true;
    }

    const replayRoute = requestUrl.pathname.match(/^\/api\/runs\/([^/]+)\/replay$/);
    if (replayRoute) {
      const source = await loadRun(projectPath, decodeURIComponent(replayRoute[1]!));
      const replay = createReplayRun(source);
      await saveRun(projectPath, replay);
      sendJson(response, 201, { id: replay.id, status: replay.status, sourceRunId: source.id });
      return true;
    }

    if (requestUrl.pathname === "/api/clean/run") {
      const result = await cleanProject(projectPath, { apply: true, fix: true });
      sendJson(response, 200, result);
      return true;
    }

    if (requestUrl.pathname === "/api/clean/undo") {
      const result = await undoLastClean(projectPath);
      sendJson(response, 200, result);
      return true;
    }

    if (requestUrl.pathname === "/api/memory") {
      const record = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
      const kind = ((record.kind as string) || "decision") as Parameters<typeof addProjectMemory>[1]["kind"];
      const content = String(record.content || "");
      const tags = Array.isArray(record.tags) ? record.tags.map(String) : [];
      const entry = await addProjectMemory(projectPath, { kind, content, tags });
      sendJson(response, 201, entry);
      return true;
    }

    if (requestUrl.pathname === "/api/memory/delete") {
      const record = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
      const id = String(record.id || "");
      const success = await removeProjectMemory(projectPath, id);
      sendJson(response, 200, { success });
      return true;
    }

    if (requestUrl.pathname === "/api/adrs") {
      const record = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
      const title = String(record.title || "").trim();
      if (!title) throw new Error("ADR title is required.");
      const status = (record.status as AdrStatus) || "Accepted";
      const context = record.context ? String(record.context) : undefined;
      const decision = record.decision ? String(record.decision) : undefined;
      const adr = await createAdr(projectPath, title, {
        status,
        ...(context !== undefined ? { context } : {}),
        ...(decision !== undefined ? { decision } : {}),
      });
      sendJson(response, 201, adr);
      return true;
    }

    if (requestUrl.pathname === "/api/adrs/sync") {
      const result = await syncMemoryToAdrs(projectPath);
      sendJson(response, 200, result);
      return true;
    }

    if (requestUrl.pathname === "/api/security/fix") {
      const scan = await scanProjectSecurity(projectPath);
      const result = await applySecurityFixes(projectPath, scan.findings);
      sendJson(response, 200, result);
      return true;
    }

    if (requestUrl.pathname.endsWith("/execute") && requestUrl.pathname.startsWith("/api/workflows/")) {
      const workflowId = requestUrl.pathname.slice("/api/workflows/".length, -"/execute".length);
      const workflow = await loadWorkflow(projectPath, decodeURIComponent(workflowId));
      const run = createRunFromWorkflow(workflow);
      run.isDemo = true;
      await saveRun(projectPath, run);
      broadcastEvent("workflow_started", {
        runId: run.id,
        workflowName: workflow.name,
        taskCount: run.tasks.length,
      });
      const provider = new DemoAgentProvider();
      const completed = await advanceRun(run, provider, new Set(), {
        maxConcurrency: 4,
        onUpdate: async (updatedRun) => {
          await saveRun(projectPath, updatedRun);
          broadcastEvent("workflow_update", {
            runId: updatedRun.id,
            status: updatedRun.status,
            tasks: updatedRun.tasks,
          });
        },
        onTaskSettled: async (updatedRun, settledTaskId) => {
          await saveRun(projectPath, updatedRun);
          const taskRecord = updatedRun.tasks.find((t) => t.task.id === settledTaskId);
          broadcastEvent("workflow_task_settled", {
            runId: updatedRun.id,
            taskId: settledTaskId,
            status: taskRecord?.status,
            result: taskRecord?.result,
          });
        },
      });
      await saveRun(projectPath, completed);
      broadcastEvent("workflow_completed", { runId: completed.id, status: completed.status });
      sendJson(response, 200, {
        id: completed.id,
        status: completed.status,
        taskCount: completed.tasks.length,
        tasks: completed.tasks,
      });
      return true;
    }

    if (requestUrl.pathname === "/api/workflows") {
      const workflow = await saveWorkflow(projectPath, body);
      sendJson(response, 201, workflow);
      return true;
    }

    const runId = requestUrl.pathname.slice("/api/workflows/".length, -"/run".length);
    const workflow = await loadWorkflow(projectPath, decodeURIComponent(runId));
    const run = createRunFromWorkflow(workflow);
    await saveRun(projectPath, run);
    sendJson(response, 201, { id: run.id, status: run.status, taskCount: run.tasks.length });
    return true;
  }

  const approvalRoute = requestUrl.pathname.match(/^\/api\/runs\/([^/]+)\/tasks\/([^/]+)\/approval$/);
  if (!approvalRoute) {
    sendJson(response, 405, { error: "Method not allowed." });
    return true;
  }
  if (rejectDisallowedPostHeaders(request, response)) return true;
  const parsed = await readJsonBody(request, response, 8192);
  if (!parsed.ok) return true;
  const body = parsed.body as {
    taskId?: string;
    decision?: string;
    reviewer?: string;
    reason?: string;
  };
  if (
    !["approved", "rejected"].includes(body.decision ?? "") ||
    typeof body.taskId !== "string" ||
    typeof body.reviewer !== "string" ||
    (body.reason !== undefined && typeof body.reason !== "string")
  ) {
    sendJson(response, 400, { error: "Invalid approval request." });
    return true;
  }
  const runId = decodeURIComponent(approvalRoute[1]!);
  const taskId = decodeURIComponent(approvalRoute[2]!);
  if (body.taskId !== taskId) {
    sendJson(response, 400, { error: "Task identifier mismatch." });
    return true;
  }
  const run = await decideTaskApproval(
    projectPath,
    runId,
    taskId,
    body.decision as "approved" | "rejected",
    body.reviewer,
    body.reason
  );
  broadcastEvent("run-updated", { runId: run.id, taskId, decision: body.decision, at: new Date().toISOString() });
  sendJson(response, 200, {
    id: run.id,
    status: run.status,
    task: run.tasks.find((item) => item.task.id === taskId),
  });
  return true;
}
