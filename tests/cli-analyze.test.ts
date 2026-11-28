import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runAnalyze } from "../src/commands/analyze.js";
import { safeRm } from "./test-helpers.js";

let stdout = "";
let stderr = "";
const originalStdout = process.stdout.write.bind(process.stdout);
const originalStderr = process.stderr.write.bind(process.stderr);
const dirs: string[] = [];

beforeEach(() => {
  stdout = "";
  stderr = "";
  process.exitCode = 0;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += String(chunk);
    return true;
  }) as typeof process.stderr.write;
});

afterEach(async () => {
  process.stdout.write = originalStdout;
  process.stderr.write = originalStderr;
  process.exitCode = 0;
  await Promise.all(dirs.splice(0).map((dir) => safeRm(dir)));
});

async function makeWorkspace(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "anvil-cli-analyze-"));
  dirs.push(dir);
  return dir;
}

describe("runAnalyze modes and error handling", () => {
  it("prints usage help on --help and -h without creating files", async () => {
    await runAnalyze("analyze", ["--help"]);
    expect(stdout).toContain("anvil analyze");
    expect(process.exitCode).toBe(0);

    stdout = "";
    await runAnalyze("analyze", ["-h"]);
    expect(stdout).toContain("anvil analyze");
  });

  it("prints dry-run guidance when --write is omitted", async () => {
    const root = await makeWorkspace();
    await runAnalyze("analyze", [root]);
    expect(stdout).toContain("--write");
    expect(stderr).toBe("");
    expect(process.exitCode).toBe(0);
  });

  it("prints JSON analysis when --json is passed without --write", async () => {
    const root = await makeWorkspace();
    await runAnalyze("analyze", [root, "--json"]);
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    expect(Object.keys(parsed).length).toBeGreaterThan(0);
    expect(process.exitCode).toBe(0);
  });

  it("reports unknown CLI flags and sets exitCode to 1", async () => {
    await runAnalyze("analyze", ["--unknown-analyze-flag"]);
    expect(stderr).toContain("Unknown option");
    expect(process.exitCode).toBe(1);
  });
});
