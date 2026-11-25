import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { safeRm } from "./test-helpers.js";
import { createRun } from "../src/core/orchestrator.js";
import { saveRun } from "../src/core/run-store.js";
import type { BenchmarkMatrixReport } from "../src/core/benchmark-matrix.js";

function runCli(...args: string[]): string {
  return execFileSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

/**
 * Like runCli but does NOT throw on non-zero exit codes.
 * Returns { stdout, exitCode } so tests can inspect both.
 */
function runCliRaw(...args: string[]): { stdout: string; exitCode: number } {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  return { stdout: result.stdout as string, exitCode: result.status ?? 1 };
}

const temporaryDirectories: string[] = [];
async function createWorkspace(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "anvil-cli-help-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => safeRm(directory)));
});

describe("run-history CLI help", () => {
  it("prints runs usage without reading project history", () => {
    expect(runCli("runs", "--help")).toContain("Usage: anvil runs [path] [--json] [--limit N] [--status STATUS]");
  });

  it("documents the versioned JSON option and run limit", () => {
    const help = runCli("runs", "--help");
    expect(help).toContain("versioned machine-readable summary");
    expect(help).toContain("--limit N");
    expect(help).toContain("--status");
  });

  it("prints show-run usage without requiring a run ID", () => {
    expect(runCli("show-run", "--help")).toContain("Usage: anvil show-run RUN_ID [--path PROJECT]");
  });

  it("rejects malformed show-run arguments", async () => {
    const directory = await createWorkspace();
    for (const args of [
      ["anvil-example", "--path"],
      ["anvil-example", "--path", "--json"],
      ["anvil-example", "--path", directory, "--path", directory],
      ["anvil-example", "extra"],
      ["anvil-example", "--unexpected"],
    ]) {
      expect(() => runCli("show-run", ...args)).toThrow();
    }
  }, 20_000);

  it("limits text and JSON history to the newest runs", async () => {
    const directory = await createWorkspace();
    const older = createRun("Older run", [
      { id: "older-task", agent: "planner", title: "Older task", prompt: "Plan older run" },
    ]);
    older.createdAt = "2026-01-01T00:00:00.000Z";
    older.status = "failed";
    const newer = createRun("Newer run", [
      { id: "newer-task", agent: "planner", title: "Newer task", prompt: "Plan newer run" },
    ]);
    newer.createdAt = "2026-01-02T00:00:00.000Z";
    newer.status = "completed";
    const newest = createRun("Newest run", [
      { id: "newest-task", agent: "planner", title: "Newest task", prompt: "Plan newest run" },
    ]);
    newest.createdAt = "2026-01-03T00:00:00.000Z";
    newest.status = "completed";
    await saveRun(directory, older);
    await saveRun(directory, newer);
    await saveRun(directory, newest);

    const textOutput = runCli("runs", directory, "--limit", "1");
    expect(textOutput).toContain(newest.id);
    expect(textOutput).not.toContain(newer.id);
    expect(textOutput).not.toContain(older.id);

    const jsonOutput = JSON.parse(runCli("runs", directory, "--json", "--limit", "1"));
    expect(jsonOutput.runs).toHaveLength(1);
    expect(jsonOutput.runs[0].id).toBe(newest.id);

    const completedOutput = runCli("runs", directory, "--status", "completed");
    expect(completedOutput).toContain(newer.id);
    expect(completedOutput).toContain(newest.id);
    expect(completedOutput).not.toContain(older.id);
    const combinedJson = JSON.parse(runCli("runs", "--status", "completed", "--limit", "1", directory, "--json"));
    expect(combinedJson.runs).toHaveLength(1);
    expect(combinedJson.runs[0].id).toBe(newest.id);
    const failedJson = JSON.parse(runCli("runs", directory, "--json", "--status", "failed"));
    expect(failedJson.runs.map((run: { id: string }) => run.id)).toEqual([older.id]);
  }, 20_000);

  it("rejects missing and invalid run-history option values", async () => {
    const directory = await createWorkspace();
    for (const args of [
      ["--limit"],
      ["--limit", "0"],
      ["--limit", "many"],
      ["--limit", "--json"],
      ["--status"],
      ["--status", "unknown"],
      ["--status", "--json"],
    ]) {
      expect(() => runCli("runs", directory, ...args)).toThrow();
    }
  }, 45_000);

  it("rejects duplicate and unknown run-history options", async () => {
    const directory = await createWorkspace();
    for (const args of [
      ["--limit", "1", "--limit", "2"],
      ["--status", "completed", "--status", "failed"],
      ["--json", "--json"],
      ["--unexpected"],
      ["first-project", "second-project"],
      ["--limit", "1", "first-project", "second-project"],
    ]) {
      expect(() => runCli("runs", directory, ...args)).toThrow();
    }
  }, 45_000);
});

// ---------------------------------------------------------------------------
// anvil agent-intelligence --help and --json
// ---------------------------------------------------------------------------

describe("agent-intelligence CLI flags", () => {
  it("prints usage and exits cleanly when --help is passed", () => {
    const output = runCli("agent-intelligence", "--help");
    expect(output).toContain("Usage: anvil agent-intelligence");
    expect(output).toContain("--suite ID");
    expect(output).toContain("--candidate ID");
    expect(output).toContain("--limit N");
    expect(output).toContain("--json");
    expect(output).toContain("--path PROJECT");
    expect(output).toContain("Exit codes:");
  });

  it("--help appears in the global help command listing", () => {
    const output = runCli("help");
    expect(output).toContain("agent-intelligence");
    expect(output).toContain("--json");
  });

  it("returns insufficient-data JSON when there is no benchmark history", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "anvil-agi-json-"));
    try {
      // Uses runCliRaw so we can inspect output even when exit code is 2.
      const { stdout, exitCode } = runCliRaw("agent-intelligence", "--path", directory, "--json");
      expect(exitCode).toBe(2);
      const report = JSON.parse(stdout.trim()) as {
        status: string;
        cards: unknown[];
        recommendations: string[];
        caveats: string[];
      };
      expect(report.status).toBe("insufficient-data");
      expect(report.cards).toHaveLength(0);
      expect(Array.isArray(report.recommendations)).toBe(true);
      expect(Array.isArray(report.caveats)).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 20_000);

  it("returns a ready JSON report when benchmark history exists", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "anvil-agi-ready-"));
    try {
      // Write a minimal benchmark matrix report to .anvil/benchmark-matrices/
      const benchmarkDir = path.join(directory, ".anvil", "benchmark-matrices");
      await mkdir(benchmarkDir, { recursive: true });
      const matrixReport: BenchmarkMatrixReport = {
        version: 1,
        matrixId: "matrix-a",
        matrixName: "Matrix A",
        suiteId: "suite-a",
        goal: "review changes",
        createdAt: new Date().toISOString(),
        results: [
          {
            candidateId: "candidate-a",
            provider: "openai",
            model: "gpt-4",
            repeat: 1,
            runId: "run-a",
            score: 85,
            passed: true,
            durationMs: 1000,
            estimatedTokens: 300,
            status: "completed",
            agentScores: [
              { agent: "code-reviewer", caseId: "case-a", score: 85, passed: true, skillIds: [], failedCriteria: [] },
            ],
          },
        ],
        summary: [
          {
            candidateId: "candidate-a",
            provider: "openai",
            model: "gpt-4",
            trials: 1,
            completed: 1,
            averageScore: 85,
            passRate: 100,
            scoreStdDev: 0,
            averageDurationMs: 1000,
            averageEstimatedTokens: 300,
          },
        ],
        agentSummary: [
          {
            candidateId: "candidate-a",
            provider: "openai",
            model: "gpt-4",
            agent: "code-reviewer",
            trials: 1,
            completed: 1,
            averageScore: 85,
            passRate: 100,
            skillsObserved: [],
          },
        ],
      };
      await writeFile(path.join(benchmarkDir, "matrix-a-report.json"), JSON.stringify(matrixReport, null, 2), {
        encoding: "utf8",
      });
      // trim() strips any trailing newline / whitespace before parsing.
      const { stdout, exitCode } = runCliRaw("agent-intelligence", "--path", directory, "--json");
      expect(exitCode).toBe(0);
      const report = JSON.parse(stdout.trim()) as {
        status: string;
        cards: Array<{ agent: string; averageScore: number; confidence: string }>;
      };
      expect(report.status).toBe("ready");
      expect(report.cards).toHaveLength(1);
      expect(report.cards[0]!.agent).toBe("code-reviewer");
      expect(report.cards[0]!.averageScore).toBe(85);
      expect(report.cards[0]!.confidence).toBe("low");
    } finally {
      await safeRm(directory);
    }
  }, 20_000);

  it("rejects --limit values outside the allowed range", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "anvil-agi-limit-"));
    try {
      for (const badLimit of ["1", "51", "abc"]) {
        expect(() => runCli("agent-intelligence", "--path", directory, "--limit", badLimit)).toThrow();
      }
    } finally {
      await safeRm(directory);
    }
  }, 20_000);
});

describe("clean and fix CLI commands", () => {
  it("prints clean usage when --help is passed", () => {
    const output = runCli("clean", "--help");
    expect(output).toContain("Usage: anvil clean");
    expect(output).toContain("--apply");
    expect(output).toContain("--fix");
    expect(output).toContain("--json");
  });

  it("prints fix usage when --help is passed", () => {
    const output = runCli("fix", "--help");
    expect(output).toContain("Usage: anvil fix");
  });

  it("prints doctor usage and documents --fix flag", () => {
    const output = runCli("doctor", "--help");
    expect(output).toContain("Usage: anvil doctor");
    expect(output).toContain("--fix");
    expect(output).toContain("--json");
  });

  it("prints undo usage when --help is passed", () => {
    const output = runCli("undo", "--help");
    expect(output).toContain("Usage: anvil undo");
    expect(output).toContain("Rollback");
  });

  it("prints mcp usage and supports mcp setup", () => {
    const output = runCli("mcp");
    expect(output).toContain("Model Context Protocol");
    expect(output).toContain("anvil mcp setup");

    const setupOutput = runCli("mcp", "setup", "--client", "claude");
    expect(setupOutput).toContain("Model Context Protocol Harness Setup");
    expect(setupOutput).toContain("claude mcp add");
  });

  it("prints adr usage and documents subcommands", () => {
    const output = runCli("adr", "--help");
    expect(output).toContain("Usage: anvil adr <subcommand>");
    expect(output).toContain("init");
    expect(output).toContain("new");
    expect(output).toContain("list");
    expect(output).toContain("sync");
  });

  it("prints security usage and documents flags", () => {
    const output = runCli("security", "--help");
    expect(output).toContain("Usage: anvil security [path]");
    expect(output).toContain("--fix");
    expect(output).toContain("--json");
  });

  it("supports mcp catalog, add, sync, and clean consult --with suggestions", async () => {
    const catalogOut = runCli("mcp", "catalog");
    expect(catalogOut).toContain("context7");
    expect(catalogOut).toContain("playwright");

    const dir = await createWorkspace();
    const addOut = runCli("mcp", "add", "context7", "--targets", "claude,cursor", "--path", dir);
    expect(addOut).toContain("ANVIL MCP add");
    const syncOut = runCli("mcp", "sync", dir, "--targets", "gemini", "--dry-run");
    expect(syncOut).toContain("ANVIL MCP sync (dry run)");

    const consultOut = runCli("consult", "security review", "--limit", "3");
    expect(consultOut).toContain("anvil install --with ");
    expect(consultOut).not.toContain("forge install --with ");

    const repairHelp = runCli("repair", "--help");
    expect(repairHelp).toContain("anvil repair");
  }, 20_000);
});
