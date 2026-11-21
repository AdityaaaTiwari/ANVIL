import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { safeRm } from "./test-helpers.js";

function runCliRaw(...args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  return { stdout: result.stdout as string, stderr: result.stderr as string, exitCode: result.status ?? 1 };
}

const temporaryDirectories: string[] = [];
async function createWorkspace(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "anvil-cli-security-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => safeRm(directory)));
});

describe("ANVIL security CLI", () => {
  it("passes clean repository and reports zero vulnerabilities", async () => {
    const ws = await createWorkspace();
    await writeFile(path.join(ws, "main.ts"), "export const ok = true;\n");
    const { stdout, exitCode } = runCliRaw("security", ws);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Clean pass");
  });

  it("fails when critical secrets are detected and supports --json", async () => {
    const ws = await createWorkspace();
    await writeFile(path.join(ws, "config.ts"), "const key = 'sk-proj-999aaabbbcccdddeeefffggg12345';\n");
    const { stdout, exitCode } = runCliRaw("security", ws, "--json");
    expect(exitCode).toBe(1);
    const report = JSON.parse(stdout);
    expect(report.passed).toBe(false);
    expect(report.summary.critical).toBeGreaterThanOrEqual(1);
  });

  it("auto-fixes exposed files with --fix", async () => {
    const ws = await createWorkspace();
    await writeFile(path.join(ws, ".env"), "API_SECRET=supersecret123\n");
    const { stdout } = runCliRaw("security", ws, "--fix");
    expect(stdout).toContain("Applied");
    expect(stdout).toContain(".gitignore");
  });
});
