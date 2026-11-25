import { existsSync } from "node:fs";
import path from "node:path";

export const ANVIL_STATE_DIR = ".anvil";
export const LEGACY_FORGE_STATE_DIR = ".forge";

/**
 * Resolves a project-local ANVIL state path.
 * Prefers `.anvil/...`, falls back to legacy `.forge/...` when it already exists
 * on disk and `.anvil/...` does not, and defaults to `.anvil/...` for new writes.
 */
export function resolveWorkspaceStatePath(projectPath: string, ...segments: string[]): string {
  const root = path.resolve(projectPath);
  const anvilPath = path.join(root, ANVIL_STATE_DIR, ...segments);
  if (existsSync(anvilPath)) return anvilPath;
  const legacyPath = path.join(root, LEGACY_FORGE_STATE_DIR, ...segments);
  if (existsSync(legacyPath)) return legacyPath;
  return anvilPath;
}

/**
 * Returns the canonical `.anvil/...` path for creating new workspace state.
 */
export function anvilWorkspacePath(projectPath: string, ...segments: string[]): string {
  return path.join(path.resolve(projectPath), ANVIL_STATE_DIR, ...segments);
}

/**
 * Returns `[.anvil/..., .forge/...]` candidate paths in priority order for read aggregation.
 */
export function listWorkspaceStatePaths(projectPath: string, ...segments: string[]): [string, string] {
  const root = path.resolve(projectPath);
  return [path.join(root, ANVIL_STATE_DIR, ...segments), path.join(root, LEGACY_FORGE_STATE_DIR, ...segments)];
}
