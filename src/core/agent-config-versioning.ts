import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile, realpath } from "node:fs/promises";
import path from "node:path";
import { ANVIL_STATE_DIR, anvilWorkspacePath, listWorkspaceStatePaths } from "./workspace-paths.js";

export interface AgentConfigFile {
  path: string;
  sha256: string;
  content: string;
}
export interface AgentConfigVersion {
  version: 1;
  id: string;
  createdAt: string;
  createdBy: string;
  note: string;
  status: "candidate" | "approved";
  approvedBy?: string;
  files: AgentConfigFile[];
}
export interface AgentConfigDiff {
  added: string[];
  changed: string[];
  removed: string[];
  unchanged: string[];
}
const SAFE_ID = /^cfg-[a-f0-9]{12}$/;
const MAX_FILE_BYTES = 128 * 1024;
const MAX_FILES = 100;

function rootDir(projectPath: string): string {
  return anvilWorkspacePath(projectPath, "config-versions");
}
function digest(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
function validateRelativePath(value: string): boolean {
  return (
    value === "hooks.json" ||
    value === "permissions.json" ||
    /^(agents|skills)\/[a-z0-9][a-z0-9-]{0,63}\.md$/.test(value)
  );
}
function validateVersion(value: unknown): AgentConfigVersion {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid agent configuration version.");
  const item = value as AgentConfigVersion;
  if (
    item.version !== 1 ||
    !SAFE_ID.test(item.id) ||
    typeof item.createdAt !== "string" ||
    typeof item.createdBy !== "string" ||
    typeof item.note !== "string" ||
    (item.status !== "candidate" && item.status !== "approved") ||
    (item.approvedBy !== undefined && (typeof item.approvedBy !== "string" || item.approvedBy.length > 80)) ||
    !Array.isArray(item.files) ||
    item.files.length > MAX_FILES
  ) {
    throw new Error("Unsupported or malformed agent configuration version.");
  }
  const seen = new Set<string>();
  for (const file of item.files) {
    if (
      !file ||
      !validateRelativePath(file.path) ||
      seen.has(file.path) ||
      typeof file.content !== "string" ||
      Buffer.byteLength(file.content, "utf8") > MAX_FILE_BYTES ||
      file.sha256 !== digest(file.content)
    )
      throw new Error("Agent configuration version contains an invalid file.");
    seen.add(file.path);
  }
  return item;
}
async function writeAtomic(destination: string, content: string): Promise<void> {
  const directory = path.dirname(destination);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, "." + randomUUID() + ".tmp");
  try {
    await writeFile(temporary, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}
export async function captureAgentConfigVersion(
  projectPath: string,
  input: { createdBy?: string; note?: string } = {}
): Promise<AgentConfigVersion> {
  const root = path.resolve(projectPath);
  const realRoot = await realpath(root);
  const files: AgentConfigFile[] = [];
  const seenRelative = new Set<string>();
  let agentMarkdownFileCount = 0;

  for (const stateDirName of [ANVIL_STATE_DIR]) {
    const stateDirectory = path.join(root, stateDirName);
    for (const directory of ["agents", "skills"]) {
      const absolute = path.join(stateDirectory, directory);
      let entries;
      try {
        const realState = await realpath(stateDirectory);
        const realDirectory = await realpath(absolute);
        if (realState !== path.join(realRoot, stateDirName) || realDirectory !== path.join(realState, directory)) {
          throw new Error("Agent configuration directories must not be symbolic links.");
        }
        entries = await readdir(absolute, { withFileTypes: true });
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") continue;
        throw error;
      }
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        const relative = directory + "/" + entry.name;
        if (!validateRelativePath(relative) || seenRelative.has(relative)) continue;
        const content = await readFile(path.join(absolute, entry.name), "utf8");
        if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
          throw new Error("Configuration file exceeds 128 KiB: " + relative);
        }
        seenRelative.add(relative);
        files.push({ path: relative, sha256: digest(content), content });
        agentMarkdownFileCount += 1;
        if (files.length > MAX_FILES) throw new Error("Agent configuration snapshot exceeds 100 files.");
      }
    }
  }

  const readOptionalPolicy = async (fileName: "hooks.json" | "permissions.json", defaultContent: string) => {
    for (const stateDirName of [ANVIL_STATE_DIR]) {
      const policyFile = path.join(root, stateDirName, fileName);
      try {
        const info = await lstat(policyFile);
        if (info.isSymbolicLink() || !info.isFile()) {
          throw new Error(`The ${stateDirName}/${fileName} policy file must be a regular file, not a symbolic link.`);
        }
        const content = await readFile(policyFile, "utf8");
        if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
          throw new Error(`Configuration file exceeds 128 KiB: ${fileName}`);
        }
        files.push({ path: fileName, sha256: digest(content), content });
        if (files.length > MAX_FILES) throw new Error("Agent configuration snapshot exceeds 100 files.");
        return;
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") continue;
        throw error;
      }
    }
    files.push({ path: fileName, sha256: digest(defaultContent), content: defaultContent });
    if (files.length > MAX_FILES) throw new Error("Agent configuration snapshot exceeds 100 files.");
  };

  await readOptionalPolicy("hooks.json", "[]\n");
  await readOptionalPolicy(
    "permissions.json",
    JSON.stringify({ version: 1, mode: "proposal-only", allowedTools: [] }) + "\n"
  );

  files.sort((a, b) => a.path.localeCompare(b.path));
  if (agentMarkdownFileCount === 0) {
    throw new Error("No workspace agent or skill Markdown files found under .anvil/agents or .anvil/skills.");
  }
  const version: AgentConfigVersion = {
    version: 1,
    id: "cfg-" + randomUUID().replace(/-/g, "").slice(0, 12),
    createdAt: new Date().toISOString(),
    createdBy: (input.createdBy ?? "local-user").slice(0, 80),
    note: (input.note ?? "").slice(0, 500),
    status: "candidate",
    files,
  };
  const directory = rootDir(root);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeAtomic(path.join(directory, version.id + ".json"), JSON.stringify(version, null, 2) + "\n");
  return version;
}
export async function listAgentConfigVersions(projectPath: string): Promise<AgentConfigVersion[]> {
  const seen = new Map<string, AgentConfigVersion>();
  for (const directory of listWorkspaceStatePaths(projectPath, "config-versions")) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") continue;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !SAFE_ID.test(entry.name.replace(/\.json$/, "")) || !entry.name.endsWith(".json"))
        continue;
      const version = validateVersion(JSON.parse(await readFile(path.join(directory, entry.name), "utf8")));
      if (!seen.has(version.id)) seen.set(version.id, version);
    }
  }
  return [...seen.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function loadAgentConfigVersion(projectPath: string, id: string): Promise<AgentConfigVersion> {
  if (!SAFE_ID.test(id)) throw new Error("Invalid configuration version ID.");
  let lastError: unknown;
  for (const directory of listWorkspaceStatePaths(projectPath, "config-versions")) {
    try {
      return validateVersion(JSON.parse(await readFile(path.join(directory, id + ".json"), "utf8")));
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}
/** @deprecated Configuration approval must flow through a benchmark-gated release. */
export async function approveAgentConfigVersion(
  _projectPath: string,
  _id: string,
  _reviewer: string
): Promise<AgentConfigVersion> {
  throw new Error(
    "Direct configuration approval is disabled. Use a release-ready benchmark and the agent-release approval workflow."
  );
}
export function compareAgentConfigVersions(before: AgentConfigVersion, after: AgentConfigVersion): AgentConfigDiff {
  const a = new Map(before.files.map((file) => [file.path, file.sha256]));
  const b = new Map(after.files.map((file) => [file.path, file.sha256]));
  const added = [...b.keys()].filter((file) => !a.has(file)).sort();
  const removed = [...a.keys()].filter((file) => !b.has(file)).sort();
  const changed = [...b.keys()].filter((file) => a.has(file) && a.get(file) !== b.get(file)).sort();
  const unchanged = [...b.keys()].filter((file) => a.get(file) === b.get(file)).sort();
  return { added, changed, removed, unchanged };
}
export function formatAgentConfigVersion(version: AgentConfigVersion): string {
  return [
    "ANVIL Agent Configuration Version",
    "ID: " + version.id,
    "Created: " + version.createdAt,
    "Author: " + version.createdBy,
    "Approved by: " + (version.approvedBy ?? "not approved"),
    "Status: " + version.status.toUpperCase(),
    "Note: " + (version.note || "none"),
    "Files: " + version.files.length,
    ...version.files.map((file) => "  " + file.path + " · sha256 " + file.sha256.slice(0, 16)),
  ].join("\n");
}

/** Materialize a verified snapshot into a caller-owned empty temporary workspace. */
export async function materializeAgentConfigVersion(
  projectPath: string,
  id: string,
  destination: string
): Promise<AgentConfigVersion> {
  const version = await loadAgentConfigVersion(projectPath, id);
  const root = path.resolve(destination);
  await mkdir(root, { recursive: true, mode: 0o700 });
  try {
    for (const file of version.files) {
      if (!validateRelativePath(file.path) || file.sha256 !== digest(file.content))
        throw new Error("Snapshot integrity check failed during materialization.");
      const target = anvilWorkspacePath(root, file.path);
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, file.content, { encoding: "utf8", flag: "wx", mode: 0o600 });
    }
    return version;
  } catch (error) {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}
