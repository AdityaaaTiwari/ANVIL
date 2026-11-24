import { lstat, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { assertWorkspacePathAllowed } from "../core/workspace-browser.js";

function isInside(root: string, candidate: string): boolean {
  const normRoot = process.platform === "win32" ? root.toLowerCase() : root;
  const normCandidate = process.platform === "win32" ? candidate.toLowerCase() : candidate;
  const relative = path.relative(normRoot, normCandidate);
  return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative));
}

/** Resolves workspace-relative MCP roots without traversing symlink components. */
export function createWorkspaceResolver(workspaceRoot: string): (input?: string) => Promise<string> {
  return async (input = "."): Promise<string> => {
    if (typeof input !== "string" || input.length > 500 || path.isAbsolute(input) || /^[a-zA-Z]:/.test(input)) {
      throw new Error("Project path must be a workspace-relative directory.");
    }
    const normalized = input.replace(/\\/g, "/");
    const segments = normalized.split("/").filter((part) => part && part !== ".");
    if (segments.some((part) => part === "..")) {
      throw new Error("Requested project path is outside the configured ANVIL workspace.");
    }
    assertWorkspacePathAllowed(segments.join("/"));
    let cursor = workspaceRoot;
    for (const segment of segments) {
      cursor = path.join(cursor, segment);
      const info = await lstat(cursor);
      if (info.isSymbolicLink()) throw new Error("Symbolic links are not allowed in MCP project paths.");
    }
    const target = path.resolve(workspaceRoot, ...segments);
    const candidate = await realpath(target);
    const canonicalRoot = await realpath(workspaceRoot).catch(() => path.resolve(workspaceRoot));
    if (!isInside(canonicalRoot, candidate)) {
      throw new Error("Requested project path is outside the configured ANVIL workspace.");
    }
    const info = await stat(candidate);
    if (!info.isDirectory()) throw new Error("Project path must be a directory.");
    return target;
  };
}
