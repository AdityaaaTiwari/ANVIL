import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";

export type ProjectMemoryKind =
  "decision" | "architecture" | "constraint" | "preference" | "fact" | "handoff" | "lesson";

export interface ProjectMemoryEntry {
  id: string;
  kind: ProjectMemoryKind;
  content: string;
  tags: string[];
  evidence?: string[];
  createdAt: string;
  updatedAt: string;
}

interface MemoryDocument {
  version: 1;
  entries: ProjectMemoryEntry[];
}

const MAX_ENTRIES = 500;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MEMORY_KINDS = new Set<ProjectMemoryKind>([
  "decision",
  "architecture",
  "constraint",
  "preference",
  "fact",
  "handoff",
  "lesson",
]);
const MAX_CONTENT_LENGTH = 4000;
const SECRET_PATTERN = /(?:api[_-]?key|secret|password|access[_-]?token)\s*[:=]\s*\S+/i;

function memoryPath(projectPath: string): string {
  const root = path.resolve(projectPath);
  const anvilFile = path.join(root, ".anvil", "memory.json");
  return anvilFile;
}

async function readDocument(projectPath: string): Promise<MemoryDocument> {
  try {
    const raw = await readFile(memoryPath(projectPath));
    if (raw.byteLength > MAX_FILE_BYTES) throw new Error("Project memory file exceeds the 2 MiB safety limit.");
    const parsed: unknown = JSON.parse(raw.toString("utf8"));
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("version" in parsed) ||
      parsed.version !== 1 ||
      !("entries" in parsed) ||
      !Array.isArray(parsed.entries)
    ) {
      throw new Error("Project memory file has an unsupported format.");
    }
    if (parsed.entries.length > MAX_ENTRIES) throw new Error("Project memory file exceeds the entry limit.");
    const ids = new Set<string>();
    for (const value of parsed.entries) {
      if (!value || typeof value !== "object") throw new Error("Project memory contains an invalid entry.");
      const entry = value as Record<string, unknown>;
      if (
        typeof entry.id !== "string" ||
        !/^mem-[a-z0-9-]{1,80}$/.test(entry.id) ||
        ids.has(entry.id) ||
        typeof entry.kind !== "string" ||
        !MEMORY_KINDS.has(entry.kind as ProjectMemoryKind) ||
        typeof entry.content !== "string" ||
        !entry.content.trim() ||
        entry.content.length > MAX_CONTENT_LENGTH ||
        !Array.isArray(entry.tags) ||
        entry.tags.length > 12 ||
        !entry.tags.every((tag) => typeof tag === "string" && tag.length > 0 && tag.length <= 64) ||
        typeof entry.createdAt !== "string" ||
        !Number.isFinite(Date.parse(entry.createdAt)) ||
        typeof entry.updatedAt !== "string" ||
        !Number.isFinite(Date.parse(entry.updatedAt))
      ) {
        throw new Error("Project memory contains an invalid entry.");
      }
      ids.add(entry.id);
    }
    return parsed as MemoryDocument;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { version: 1, entries: [] };
    }
    throw error;
  }
}

async function withMemoryWriteLock<T>(projectPath: string, action: () => Promise<T>): Promise<T> {
  const directory = path.dirname(memoryPath(projectPath));
  await mkdir(directory, { recursive: true });
  const lock = path.join(directory, ".memory-write.lock");
  const token = randomUUID();
  try {
    await mkdir(lock, { mode: 0o700 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      throw new Error(
        "Project memory is being changed by another or interrupted ANVIL process. Inspect .anvil/.memory-write.lock before manual recovery."
      );
    }
    throw error;
  }
  try {
    await writeFile(
      path.join(lock, "owner.json"),
      JSON.stringify({
        token,
        pid: process.pid,
        startedAt: new Date().toISOString(),
      }) + "\n",
      { encoding: "utf8", flag: "wx", mode: 0o600 }
    );
    return await action();
  } finally {
    try {
      const owner: unknown = JSON.parse(await readFile(path.join(lock, "owner.json"), "utf8"));
      if (owner && typeof owner === "object" && "token" in owner && owner.token === token) {
        await rm(lock, { recursive: true, force: true });
      }
    } catch {
      // Leave an unverifiable lock in place; manual inspection is safer than deleting another owner's lock.
    }
  }
}

async function writeDocument(projectPath: string, document: MemoryDocument): Promise<void> {
  const destination = memoryPath(projectPath);
  const directory = path.dirname(destination);
  await mkdir(directory, { recursive: true });
  const temporary = path.join(directory, ".memory-" + randomUUID() + ".tmp");
  try {
    await writeFile(temporary, JSON.stringify(document, null, 2) + "\n", { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

function validateContent(content: string): string {
  const value = content.trim();
  if (!value) throw new Error("Memory content cannot be empty.");
  if (value.length > MAX_CONTENT_LENGTH)
    throw new Error(`Memory content must be at most ${MAX_CONTENT_LENGTH} characters.`);
  if (SECRET_PATTERN.test(value))
    throw new Error(
      "Memory appears to contain a credential. Store a reference to a secret name, never the secret value."
    );
  return value;
}

export interface ProjectMemoryInput {
  kind: ProjectMemoryKind;
  content: string;
  tags?: string[];
  source?: string;
  evidence?: string[];
}

export async function addProjectMemory(projectPath: string, input: ProjectMemoryInput): Promise<ProjectMemoryEntry> {
  if (!input || !MEMORY_KINDS.has(input.kind)) throw new Error("Memory kind is not supported.");
  if (
    input.tags !== undefined &&
    (!Array.isArray(input.tags) || input.tags.some((tag) => typeof tag !== "string" || tag.trim().length > 64))
  ) {
    throw new Error("Memory tags must be strings of at most 64 characters.");
  }
  const content = validateContent(input.content);
  return withMemoryWriteLock(projectPath, async () => {
    const document = await readDocument(projectPath);
    if (document.entries.length >= MAX_ENTRIES)
      throw new Error(`Project memory is limited to ${MAX_ENTRIES} entries. Remove old entries first.`);
    const now = new Date().toISOString();
    const entry: ProjectMemoryEntry = {
      id: "mem-" + randomUUID(),
      kind: input.kind,
      content,
      tags: [...new Set((input.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 12),
      ...(input.evidence?.length ? { evidence: input.evidence } : {}),
      createdAt: now,
      updatedAt: now,
    };
    document.entries.push(entry);
    await writeDocument(projectPath, document);
    return entry;
  });
}

export async function listProjectMemory(projectPath: string): Promise<ProjectMemoryEntry[]> {
  const document = await readDocument(projectPath);
  return [...document.entries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function removeProjectMemory(projectPath: string, id: string): Promise<boolean> {
  return withMemoryWriteLock(projectPath, async () => {
    const document = await readDocument(projectPath);
    const remaining = document.entries.filter((entry) => entry.id !== id);
    if (remaining.length === document.entries.length) return false;
    document.entries = remaining;
    await writeDocument(projectPath, document);
    return true;
  });
}

/** Select relevant notes with a conservative character budget (~4 chars/token). */
export async function buildProjectMemoryContext(
  projectPath: string,
  query: string,
  maxTokens = 1800
): Promise<{ text: string; includedIds: string[]; estimatedTokens: number }> {
  const safeBudget = Math.max(100, Math.min(8000, Math.floor(maxTokens)));
  const terms = new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9_-]+/)
      .filter((term) => term.length > 2)
  );
  const entries = await listProjectMemory(projectPath);
  const ranked = entries
    .map((entry) => {
      const haystack = (entry.content + " " + entry.tags.join(" ")).toLowerCase();
      const score =
        entry.tags.reduce((sum, tag) => sum + (terms.has(tag) ? 4 : 0), 0) +
        [...terms].reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      return { entry, score };
    })
    .sort((a, b) => b.score - a.score || b.entry.updatedAt.localeCompare(a.entry.updatedAt));

  const lines: string[] = [];
  const includedIds: string[] = [];
  let chars = 0;
  for (const { entry } of ranked) {
    const line = `[${entry.kind}] ${entry.content}`;
    const next = chars + line.length + 1;
    if (next > safeBudget * 4) continue;
    lines.push(line);
    includedIds.push(entry.id);
    chars = next;
  }
  return {
    text: lines.length
      ? "Relevant project memory (local notes; verify against current code):\n" + lines.join("\n")
      : "",
    includedIds,
    estimatedTokens: Math.ceil(chars / 4),
  };
}

export function globalMemoryRoot(): string {
  return path.resolve(process.env.ANVIL_HOME ?? homedir());
}

export interface MemorySearchHit {
  entry: ProjectMemoryEntry;
  score: number;
  layer: "project" | "global";
}

export async function searchMemory(
  projectPath: string,
  query: string,
  options: { limit?: number; includeGlobal?: boolean; kinds?: ProjectMemoryKind[] } = {}
): Promise<MemorySearchHit[]> {
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 10)));
  const entries = await listProjectMemory(projectPath);
  const terms = new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9_-]+/)
      .filter(Boolean)
  );
  const hits: MemorySearchHit[] = entries
    .filter((entry) => !options.kinds?.length || options.kinds.includes(entry.kind))
    .map((entry) => {
      const haystack = (entry.content + " " + entry.tags.join(" ")).toLowerCase();
      const score = terms.size ? [...terms].reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0) : 1;
      return { entry, score, layer: "project" as const };
    })
    .filter((hit) => hit.score > 0);

  if (options.includeGlobal) {
    const globalRoot = globalMemoryRoot();
    if (path.resolve(projectPath) !== globalRoot) {
      const globalEntries = await listProjectMemory(globalRoot);
      const globalHits = globalEntries
        .filter((entry) => !options.kinds?.length || options.kinds.includes(entry.kind))
        .map((entry) => {
          const haystack = (entry.content + " " + entry.tags.join(" ")).toLowerCase();
          const score = terms.size
            ? [...terms].reduce((sum, term) => sum + (haystack.includes(term) ? 0.85 : 0), 0)
            : 0.85;
          return { entry, score, layer: "global" as const };
        })
        .filter((hit) => hit.score > 0);
      hits.push(...globalHits);
    }
  }

  return hits.sort((a, b) => b.score - a.score || b.entry.updatedAt.localeCompare(a.entry.updatedAt)).slice(0, limit);
}

export async function latestHandoff(projectPath: string): Promise<ProjectMemoryEntry | undefined> {
  const entries = await listProjectMemory(projectPath);
  return entries.find((entry) => entry.kind === "handoff");
}
