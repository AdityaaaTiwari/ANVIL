import path from "node:path";

export const ANVIL_STATE_DIR = ".anvil";

/**
 * Resolves a project-local ANVIL state path under `.anvil/...`.
 */
export function resolveWorkspaceStatePath(projectPath: string, ...segments: string[]): string {
  return anvilWorkspacePath(projectPath, ...segments);
}

/**
 * Returns the canonical `.anvil/...` path for workspace state.
 */
export function anvilWorkspacePath(projectPath: string, ...segments: string[]): string {
  return path.join(path.resolve(projectPath), ANVIL_STATE_DIR, ...segments);
}

/**
 * Returns `[.anvil/...]` candidate state paths.
 */
export function listWorkspaceStatePaths(projectPath: string, ...segments: string[]): string[] {
  return [anvilWorkspacePath(projectPath, ...segments)];
}
