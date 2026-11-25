import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { listProjectMemory } from "./project-memory.js";

export type AdrStatus = "Proposed" | "Accepted" | "Superseded" | "Deprecated" | "Rejected";

export interface AdrRecord {
  id: string;
  number: number;
  title: string;
  status: AdrStatus;
  date: string;
  filename: string;
  path: string;
}

export interface CreateAdrOptions {
  status?: AdrStatus | undefined;
  context?: string | undefined;
  decision?: string | undefined;
  positiveConsequences?: string[] | undefined;
  negativeConsequences?: string[] | undefined;
  tags?: string[] | undefined;
}

export function adrDirectory(projectPath: string, customSubdir = "docs/adr"): string {
  return path.join(path.resolve(projectPath), customSubdir);
}

export function slugifyTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "decision"
  );
}

export async function initAdrDirectory(
  projectPath: string,
  customSubdir = "docs/adr"
): Promise<{ created: boolean; path: string }> {
  const dir = adrDirectory(projectPath, customSubdir);
  await mkdir(dir, { recursive: true });

  const firstFile = path.join(dir, "0001-record-architecture-decisions.md");
  try {
    await readFile(firstFile, "utf8");
    return { created: false, path: dir };
  } catch {
    const today = new Date().toISOString().slice(0, 10);
    const content = `# 1. Record architecture decisions

* Status: Accepted
* Date: ${today}

## Context and Problem Statement
We need to record architectural decisions made on this project so that current and future contributors understand why the code is structured the way it is.

## Decision Drivers
* Need for clear provenance of architecture choices.
* Avoid relitigating settled tradeoffs.
* Alignment with ANVIL local-first engineering principles.

## Considered Options
* Do not record decisions (rely on commit messages)
* Wiki pages or external docs
* In-repo Architecture Decision Records (ADRs)

## Decision Outcome
Chosen option: "In-repo Architecture Decision Records (ADRs)", because it keeps architecture decisions versioned, reviewable in pull requests, and co-located with the codebase.

### Positive Consequences
* Clear historical context for design tradeoffs.
* Integrated with ANVIL project memory and local dashboard.
`;
    await writeFile(firstFile, content, "utf8");
    return { created: true, path: dir };
  }
}

export async function listAdrs(projectPath: string, customSubdir = "docs/adr"): Promise<AdrRecord[]> {
  const dir = adrDirectory(projectPath, customSubdir);
  const records: AdrRecord[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const match = entry.name.match(/^(\d{4})-(.*)\.md$/);
      if (!match) continue;

      const num = parseInt(match[1]!, 10);
      const filePath = path.join(dir, entry.name);
      const text = await readFile(filePath, "utf8");

      // Extract title from first # Header
      const titleMatch = text.match(/^#\s+(?:\d+\.\s*)?([^\r\n]+)/m);
      const title = titleMatch ? titleMatch[1]!.trim() : match[2]!.replace(/-/g, " ");

      // Extract status
      const statusMatch = text.match(/\*\s*Status:\s*([^\r\n]+)/i);
      const rawStatus = statusMatch ? statusMatch[1]!.trim() : "Proposed";
      const status: AdrStatus = (
        ["Accepted", "Proposed", "Superseded", "Deprecated", "Rejected"].includes(rawStatus) ? rawStatus : "Proposed"
      ) as AdrStatus;

      // Extract date
      const dateMatch = text.match(/\*\s*Date:\s*([^\r\n]+)/i);
      const date = dateMatch ? dateMatch[1]!.trim() : new Date().toISOString().slice(0, 10);

      records.push({
        id: match[1]!,
        number: num,
        title,
        status,
        date,
        filename: entry.name,
        path: filePath,
      });
    }
  } catch {
    return [];
  }

  return records.sort((a, b) => a.number - b.number);
}

export async function createAdr(
  projectPath: string,
  title: string,
  options: CreateAdrOptions = {},
  customSubdir = "docs/adr"
): Promise<AdrRecord> {
  const dir = adrDirectory(projectPath, customSubdir);
  await mkdir(dir, { recursive: true });

  const existing = await listAdrs(projectPath, customSubdir);
  const nextNum = existing.length > 0 ? Math.max(...existing.map((r) => r.number)) + 1 : 1;
  const numStr = String(nextNum).padStart(4, "0");
  const slug = slugifyTitle(title);
  const filename = `${numStr}-${slug}.md`;
  const filePath = path.join(dir, filename);

  const status = options.status ?? "Accepted";
  const date = new Date().toISOString().slice(0, 10);
  const context = options.context ?? `We need to decide on: ${title}.`;
  const decision = options.decision ?? `We will adopt ${title} as standard in this project.`;
  const positive = options.positiveConsequences ?? ["Clear implementation standard across components."];
  const negative = options.negativeConsequences ?? [];

  const content = `# ${nextNum}. ${title.trim()}

* Status: ${status}
* Date: ${date}

## Context and Problem Statement
${context.trim()}

## Decision Outcome
${decision.trim()}

### Positive Consequences
${positive.map((p) => `* ${p}`).join("\n")}
${negative.length ? `\n### Negative Consequences\n${negative.map((n) => `* ${n}`).join("\n")}` : ""}
`;

  await writeFile(filePath, content, "utf8");

  return {
    id: numStr,
    number: nextNum,
    title: title.trim(),
    status,
    date,
    filename,
    path: filePath,
  };
}

export async function syncMemoryToAdrs(
  projectPath: string,
  customSubdir = "docs/adr"
): Promise<{ syncedCount: number; createdAdrs: AdrRecord[] }> {
  await initAdrDirectory(projectPath, customSubdir);
  const existingAdrs = await listAdrs(projectPath, customSubdir);
  const existingTitles = new Set(existingAdrs.map((a) => a.title.toLowerCase().trim()));

  const memoryEntries = await listProjectMemory(projectPath);
  const decisionEntries = memoryEntries.filter((e) => e.kind === "decision" || e.kind === "architecture");

  const createdAdrs: AdrRecord[] = [];

  for (const entry of decisionEntries) {
    const rawTitle = entry.content.length > 60 ? entry.content.slice(0, 57) + "..." : entry.content;
    const titleCandidate = rawTitle.replace(/\r?\n.*/s, "").trim();

    if (existingTitles.has(titleCandidate.toLowerCase())) continue;

    const adr = await createAdr(
      projectPath,
      titleCandidate,
      {
        status: "Accepted",
        context: `Recorded from ANVIL project memory (${entry.id}). Tags: ${(entry.tags || []).join(", ") || "none"}.`,
        decision: entry.content,
        positiveConsequences: ["Co-located in version control for automated agent adherence."],
      },
      customSubdir
    );

    existingTitles.add(titleCandidate.toLowerCase());
    createdAdrs.push(adr);
  }

  return {
    syncedCount: createdAdrs.length,
    createdAdrs,
  };
}
