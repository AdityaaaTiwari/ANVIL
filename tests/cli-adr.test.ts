import { execFileSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { safeRm } from "./test-helpers.js";
import { addProjectMemory } from "../src/core/project-memory.js";

function runCli(...args: string[]): string {
  return execFileSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

const temporaryDirectories: string[] = [];
async function createWorkspace(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "anvil-cli-adr-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => safeRm(directory)));
});

describe("ANVIL adr CLI", () => {
  it("initializes ADR directory with 0001 template", async () => {
    const ws = await createWorkspace();
    const output = runCli("adr", "init", ws);
    expect(output).toContain("Initialized Architecture Decision Records");

    const listOutput = runCli("adr", "list", ws);
    expect(listOutput).toContain("Architecture Decision Records (1)");
    expect(listOutput).toContain("Record architecture decisions");
  });

  it("creates a new ADR via CLI", async () => {
    const ws = await createWorkspace();
    runCli("adr", "init", ws);
    const newOutput = runCli("adr", "new", "Use SQLite for metadata", ws, "--status", "Accepted");
    expect(newOutput).toContain("Created ADR 0002");

    const listOutput = runCli("adr", "list", ws);
    expect(listOutput).toContain("Architecture Decision Records (2)");
    expect(listOutput).toContain("Use SQLite for metadata");
  });

  it("syncs project memory decisions to ADR directory", async () => {
    const ws = await createWorkspace();
    await addProjectMemory(ws, {
      kind: "decision",
      content: "Require strict test coverage for all parsers",
      tags: ["testing", "quality"],
    });

    const syncOutput = runCli("adr", "sync", ws);
    expect(syncOutput).toContain("Synced 1 decisions from project memory");

    const listOutput = runCli("adr", "list", ws);
    expect(listOutput).toContain("Require strict test coverage for all parsers");
  });
});
