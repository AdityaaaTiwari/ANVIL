import { randomBytes } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  BLOCK_BEGIN,
  BLOCK_END,
  LEGACY_BLOCK_BEGIN,
  LEGACY_BLOCK_END,
  LEGACY_TRANSACTION_JOURNAL_PATH,
  TRANSACTION_JOURNAL_PATH,
} from "./types.js";

function isMissing(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ENOENT"
  );
}

export function assertRelativeSafe(relativePath: string): void {
  if (
    !relativePath ||
    path.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]/).some((part) => part === ".." || part === "")
  ) {
    throw new Error(`Refusing unsafe install path "${relativePath}".`);
  }
}

/** Resolve a project-relative path, refusing symlinked ancestors that could escape the project. */
export async function resolveInside(root: string, relativePath: string): Promise<string> {
  assertRelativeSafe(relativePath);
  const parts = relativePath.split("/");
  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error(`Refusing to install through non-directory or symlink "${path.relative(root, current)}".`);
      }
    } catch (error) {
      if (isMissing(error)) return path.join(root, ...parts);
      throw error;
    }
  }
  const target = path.join(root, ...parts);
  try {
    const info = await lstat(target);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new Error(`Refusing to replace non-regular file "${relativePath}".`);
    }
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  return target;
}

export async function readIfExists(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

async function atomicWrite(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.anvil-${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
  try {
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export interface FileTransactionOperation {
  path: string;
  content: string | null;
}

/** Apply file mutations with snapshots and reverse-order rollback on failure. */
export async function applyFileTransaction(operations: FileTransactionOperation[]): Promise<void> {
  const snapshots = new Map<string, string | undefined>();
  const applied: string[] = [];
  try {
    for (const operation of operations) {
      if (!snapshots.has(operation.path)) snapshots.set(operation.path, await readIfExists(operation.path));
      if (operation.content === null) await rm(operation.path, { force: true });
      else await atomicWrite(operation.path, operation.content);
      applied.push(operation.path);
    }
  } catch (cause) {
    const rollbackErrors: string[] = [];
    for (const file of [...new Set(applied)].reverse()) {
      try {
        const previous = snapshots.get(file);
        if (previous === undefined) await rm(file, { force: true });
        else await atomicWrite(file, previous);
      } catch (error) {
        rollbackErrors.push(file + ": " + (error instanceof Error ? error.message : String(error)));
      }
    }
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      "ANVIL install transaction failed: " +
        detail +
        (rollbackErrors.length
          ? ". Rollback also failed: " + rollbackErrors.join("; ")
          : ". All applied changes were rolled back.")
    );
  }
}

interface TransactionJournal {
  schemaVersion: 1;
  snapshots: Array<{ path: string; contentBase64: string | null }>;
}

async function restoreJournal(root: string, journal: TransactionJournal): Promise<void> {
  for (const snapshot of [...journal.snapshots].reverse()) {
    assertRelativeSafe(snapshot.path);
    const absolute = await resolveInside(root, snapshot.path);
    if (snapshot.contentBase64 === null) await rm(absolute, { force: true });
    else await atomicWrite(absolute, Buffer.from(snapshot.contentBase64, "base64").toString("utf8"));
  }
}

async function recoverJournalFile(root: string, relativeJournalPath: string): Promise<boolean> {
  const journalPath = path.join(root, relativeJournalPath);
  const raw = await readIfExists(journalPath);
  if (raw === undefined) return false;
  let journal: TransactionJournal;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      (parsed as TransactionJournal).schemaVersion !== 1 ||
      !Array.isArray((parsed as TransactionJournal).snapshots)
    ) {
      throw new Error("invalid journal shape");
    }
    journal = parsed as TransactionJournal;
    const seenPaths = new Set<string>();
    for (const item of journal.snapshots) {
      if (
        !item ||
        typeof item.path !== "string" ||
        !(item.contentBase64 === null || typeof item.contentBase64 === "string")
      ) {
        throw new Error("invalid snapshot entry");
      }
      assertRelativeSafe(item.path);
      if (seenPaths.has(item.path)) throw new Error("duplicate snapshot path");
      seenPaths.add(item.path);
      if (item.contentBase64 !== null) {
        // Buffer.from(..., "base64") silently accepts malformed input; journals must be canonical.
        const encoded = item.contentBase64;
        if (
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded) ||
          Buffer.from(encoded, "base64").toString("base64") !== encoded
        ) {
          throw new Error("invalid snapshot base64");
        }
      }
    }
  } catch (error) {
    throw new Error(
      "ANVIL transaction recovery journal is invalid; it was left untouched: " +
        (error instanceof Error ? error.message : String(error))
    );
  }
  await restoreJournal(root, journal);
  await rm(journalPath, { force: true });
  return true;
}

/** Recover an interrupted install/uninstall by restoring durable pre-transaction snapshots. */
export async function recoverFileTransaction(projectPath: string): Promise<boolean> {
  const root = await realpath(path.resolve(projectPath));
  const recoveredPrimary = await recoverJournalFile(root, TRANSACTION_JOURNAL_PATH);
  const recoveredLegacy = await recoverJournalFile(root, LEGACY_TRANSACTION_JOURNAL_PATH);
  return recoveredPrimary || recoveredLegacy;
}

/** Persist snapshots before mutations so a later CLI invocation can recover after a process crash. */
export async function applyDurableFileTransaction(
  projectPath: string,
  operations: FileTransactionOperation[]
): Promise<void> {
  const root = await realpath(path.resolve(projectPath));
  await recoverFileTransaction(root);
  const snapshots = new Map<string, string | undefined>();
  for (const operation of operations) {
    const relative = path.relative(root, operation.path).split(path.sep).join("/");
    assertRelativeSafe(relative);
    if (!snapshots.has(relative)) snapshots.set(relative, await readIfExists(await resolveInside(root, relative)));
  }
  const journal: TransactionJournal = {
    schemaVersion: 1,
    snapshots: [...snapshots].map(([file, content]) => ({
      path: file,
      contentBase64: content === undefined ? null : Buffer.from(content, "utf8").toString("base64"),
    })),
  };
  const journalPath = path.join(root, TRANSACTION_JOURNAL_PATH);
  await atomicWrite(journalPath, JSON.stringify(journal, null, 2) + "\n");
  try {
    await applyFileTransaction(operations);
    await rm(journalPath, { force: true });
  } catch (error) {
    try {
      await restoreJournal(root, journal);
      await rm(journalPath, { force: true });
    } catch (recoveryError) {
      throw new Error(
        (error instanceof Error ? error.message : String(error)) +
          ". Durable recovery journal retained at " +
          TRANSACTION_JOURNAL_PATH +
          "; next ANVIL install/uninstall will retry recovery. Recovery error: " +
          (recoveryError instanceof Error ? recoveryError.message : String(recoveryError))
      );
    }
    throw error;
  }
}

export async function pruneEmptyParents(root: string, file: string): Promise<void> {
  let directory = path.dirname(file);
  while (directory.startsWith(root + path.sep) && directory !== root) {
    try {
      if ((await readdir(directory)).length > 0) return;
      await rmdir(directory);
    } catch {
      return;
    }
    directory = path.dirname(directory);
  }
}

function findBlockBounds(content: string, beginMarker: string, endMarker: string): [number, number] | undefined {
  const start = content.indexOf(beginMarker);
  const end = content.indexOf(endMarker);
  if (start === -1 && end === -1) return undefined;
  if (start === -1 || end === -1 || end < start || content.indexOf(beginMarker, start + 1) !== -1) {
    throw new Error("ANVIL managed block markers are malformed; fix them manually.");
  }
  return [start, end];
}

export function extractManagedBlock(content: string): { before: string; block: string; after: string } | undefined {
  const pairs: Array<[string, string]> = [
    [BLOCK_BEGIN, BLOCK_END],
    [LEGACY_BLOCK_BEGIN, LEGACY_BLOCK_END],
  ];
  for (const [beginMarker, endMarker] of pairs) {
    const bounds = findBlockBounds(content, beginMarker, endMarker);
    if (bounds) {
      const [start, end] = bounds;
      return {
        before: content.slice(0, start),
        block: content
          .slice(start + beginMarker.length, end)
          .replace(/^\r?\n/, "")
          .replace(/\r?\n$/, ""),
        after: content.slice(end + endMarker.length),
      };
    }
  }
  return undefined;
}

export function withBlock(existing: string | undefined, block: string): string {
  const rendered = `${BLOCK_BEGIN}\n${block}\n${BLOCK_END}`;
  if (existing === undefined || existing.trim() === "") return `${rendered}\n`;
  const parts = extractManagedBlock(existing);
  if (!parts) return `${existing.replace(/\s*$/, "")}\n\n${rendered}\n`;
  return `${parts.before}${rendered}${parts.after}`;
}

export function withoutBlock(existing: string): string {
  const parts = extractManagedBlock(existing);
  if (!parts) return existing;
  const before = parts.before.trimEnd();
  const after = parts.after.trim();
  const joined = before && after ? `${before}\n\n${after}` : before || after;
  return joined ? `${joined}\n` : "";
}
