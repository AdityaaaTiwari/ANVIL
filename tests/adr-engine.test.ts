import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { safeRm } from "./test-helpers.js";
import { initAdrDirectory, listAdrs, createAdr, syncMemoryToAdrs } from "../src/core/adr-engine.js";
import { addProjectMemory } from "../src/core/project-memory.js";

const temporaryDirectories: string[] = [];
async function createWorkspace(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "anvil-adr-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => safeRm(directory)));
});

describe("Architecture Decision Records Engine", () => {
  it("initializes ADR directory with 0001 record", async () => {
    const ws = await createWorkspace();
    const result = await initAdrDirectory(ws);
    expect(result.created).toBe(true);

    const adrs = await listAdrs(ws);
    expect(adrs).toHaveLength(1);
    expect(adrs[0]!.number).toBe(1);
    expect(adrs[0]!.title).toBe("Record architecture decisions");
    expect(adrs[0]!.status).toBe("Accepted");
  });

  it("creates sequential numbered ADRs with MADR format", async () => {
    const ws = await createWorkspace();
    await initAdrDirectory(ws);

    const record = await createAdr(ws, "Use Vitest for Parallel Test Execution", {
      status: "Accepted",
      context: "We need faster test runs with native TypeScript support.",
      decision: "Adopt Vitest across all 75+ test suites."
    });

    expect(record.number).toBe(2);
    expect(record.id).toBe("0002");
    expect(record.filename).toBe("0002-use-vitest-for-parallel-test-execution.md");

    const fileContent = await readFile(record.path, "utf8");
    expect(fileContent).toContain("# 2. Use Vitest for Parallel Test Execution");
    expect(fileContent).toContain("* Status: Accepted");
    expect(fileContent).toContain("## Context and Problem Statement");
    expect(fileContent).toContain("We need faster test runs with native TypeScript support.");
  });

  it("lists all records ordered by number", async () => {
    const ws = await createWorkspace();
    await initAdrDirectory(ws);
    await createAdr(ws, "Second Choice");
    await createAdr(ws, "Third Choice");

    const adrs = await listAdrs(ws);
    expect(adrs).toHaveLength(3);
    expect(adrs.map(a => a.number)).toEqual([1, 2, 3]);
  });

  it("syncs decision items from project memory into ADRs without duplication", async () => {
    const ws = await createWorkspace();
    await initAdrDirectory(ws);

    await addProjectMemory(ws, {
      kind: "decision",
      content: "Require pre-commit quality gate before merge",
      tags: ["git", "workflow"]
    });

    const sync1 = await syncMemoryToAdrs(ws);
    expect(sync1.syncedCount).toBe(1);

    const adrs = await listAdrs(ws);
    expect(adrs).toHaveLength(2);
    expect(adrs[1]!.title).toContain("Require pre-commit quality gate before merge");

    // Second sync should not duplicate
    const sync2 = await syncMemoryToAdrs(ws);
    expect(sync2.syncedCount).toBe(0);
  });
});
