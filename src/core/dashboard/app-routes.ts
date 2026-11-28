import { mkdtemp, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { inspectApp, type AppReport } from "../app-intel/app-inspector.js";
import { isPathInsideRoot } from "../binary-intelligence.js";
import { sendJson } from "./http-helpers.js";

/**
 * Dashboard routes for `anvil app`: list app artifacts in the workspace,
 * inspect one by path, or inspect a file dropped into the browser.
 */

export const APP_FILE_PATTERN =
  /\.(apk|aab|xapk|ipa|asar|wasm|map|exe|dll|so|dylib|node|jar|vsix|xpi)$|(^|\/)app\.asar$|\.so\.\d+(\.\d+)*$/i;
export const MAX_UPLOAD_BYTES = 256 * 1024 * 1024;
const SKIP_DIRS = new Set(["node_modules", ".git", ".anvil", ".hg", ".svn", ".venv", "venv", "__pycache__", ".next"]);
const MAX_CANDIDATES = 200;
const MAX_VISITED = 20_000;

export interface AppCandidate {
  path: string;
  sizeBytes: number;
}

export async function listAppCandidates(projectPath: string): Promise<AppCandidate[]> {
  const root = path.resolve(projectPath);
  const found: AppCandidate[] = [];
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  let visited = 0;
  while (queue.length && found.length < MAX_CANDIDATES && visited < MAX_VISITED) {
    const { dir, depth } = queue.shift() as { dir: string; depth: number };
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      visited += 1;
      const full = path.join(dir, entry.name);
      const relative = path.relative(root, full).split(path.sep).join("/");
      if (entry.isDirectory()) {
        if (depth < 6 && !SKIP_DIRS.has(entry.name)) queue.push({ dir: full, depth: depth + 1 });
      } else if (entry.isFile() && APP_FILE_PATTERN.test(relative)) {
        try {
          const info = await stat(full);
          if (info.size > 0) found.push({ path: relative, sizeBytes: info.size });
        } catch {
          /* vanished: skip */
        }
        if (found.length >= MAX_CANDIDATES) break;
      }
    }
  }
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

function withoutAbsolutePath(report: AppReport, displayName: string): AppReport {
  const summary = { ...report.summary };
  if (typeof summary.extractedTo === "string") delete summary.extractedTo;
  return { ...report, file: displayName, summary };
}

export async function inspectWorkspaceApp(projectPath: string, relativePath: string): Promise<AppReport> {
  if (!relativePath || relativePath.length > 1000) throw new Error("Give the path of an app file in the workspace.");
  const root = await realpath(path.resolve(projectPath));
  const target = await realpath(path.resolve(root, relativePath));
  if (!isPathInsideRoot(root, target)) throw new Error("The file must be inside the workspace.");
  return withoutAbsolutePath(await inspectApp(target), path.relative(root, target).split(path.sep).join("/"));
}

/** Keeps only a safe base name so the extension can drive format detection. */
export function safeUploadName(header: string | string[] | undefined): string {
  const raw = Array.isArray(header) ? header[0] : header;
  let decoded = "";
  try {
    decoded = decodeURIComponent(raw ?? "");
  } catch {
    decoded = raw ?? "";
  }
  const base = path
    .basename(decoded.replace(/\\/g, "/"))
    .replace(/[^\w.-]/g, "_")
    .slice(-120);
  return base && base !== "." && base !== ".." ? base : "upload.bin";
}

function rejectCrossSiteUpload(request: IncomingMessage, response: ServerResponse): boolean {
  const origin = request.headers.origin;
  if (origin) {
    let host = "";
    try {
      host = new URL(origin).host;
    } catch {
      host = "";
    }
    if (host !== request.headers.host) {
      sendJson(response, 403, { error: "Cross-origin requests are not allowed." });
      return true;
    }
  }
  // A custom header can't be sent cross-site without a CORS preflight, which this server never approves.
  if (request.headers["x-anvil-upload"] !== "1") {
    sendJson(response, 403, { error: "Missing X-Anvil-Upload header." });
    return true;
  }
  if (!String(request.headers["content-type"] ?? "").startsWith("application/octet-stream")) {
    sendJson(response, 415, { error: "Expected application/octet-stream." });
    return true;
  }
  return false;
}

export async function handleAppUpload(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (rejectCrossSiteUpload(request, response)) return;
  const declared = Number(request.headers["content-length"] ?? 0);
  if (declared > MAX_UPLOAD_BYTES) {
    sendJson(response, 413, { error: `Files up to ${MAX_UPLOAD_BYTES / 1024 / 1024} MiB can be inspected.` });
    return;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_UPLOAD_BYTES) {
      sendJson(response, 413, { error: `Files up to ${MAX_UPLOAD_BYTES / 1024 / 1024} MiB can be inspected.` });
      return;
    }
    chunks.push(Buffer.from(chunk));
  }
  if (!size) {
    sendJson(response, 400, { error: "The uploaded file is empty." });
    return;
  }
  const name = safeUploadName(request.headers["x-anvil-filename"]);
  const dir = await mkdtemp(path.join(os.tmpdir(), "anvil-app-upload-"));
  let outcome: { status: number; body: unknown };
  try {
    const file = path.join(dir, name);
    await writeFile(file, Buffer.concat(chunks), { mode: 0o600 });
    outcome = { status: 200, body: withoutAbsolutePath(await inspectApp(file), name) };
  } catch (error) {
    outcome = { status: 422, body: { error: error instanceof Error ? error.message : String(error) } };
  } finally {
    // Delete the copy before answering, so nothing of the upload outlives the request.
    await rm(dir, { recursive: true, force: true });
  }
  sendJson(response, outcome.status, outcome.body);
}

export async function handleAppGet(requestUrl: URL, response: ServerResponse, projectPath: string): Promise<boolean> {
  if (requestUrl.pathname === "/api/app/candidates") {
    const candidates = await listAppCandidates(projectPath);
    sendJson(response, 200, { candidates, total: candidates.length });
    return true;
  }
  if (requestUrl.pathname === "/api/app/inspect") {
    try {
      sendJson(response, 200, await inspectWorkspaceApp(projectPath, requestUrl.searchParams.get("path") ?? ""));
    } catch (error) {
      sendJson(response, 422, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }
  return false;
}
