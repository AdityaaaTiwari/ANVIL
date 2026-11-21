import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import { safeRm } from "./test-helpers.js";

const execFileAsync = promisify(execFile);
const CLI_PATH = path.resolve("./dist/cli.js");

describe("ANVIL gate CLI command", () => {
  it("prints gate usage when --help is passed", async () => {
    const { stdout } = await execFileAsync(process.execPath, [CLI_PATH, "gate", "--help"]);
    expect(stdout).toContain("Usage: anvil gate");
    expect(stdout).toContain("--sarif");
    expect(stdout).toContain("--fail-on-warnings");
  });

  it("passes clean repository and emits SARIF report", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "anvil-gate-clean-"));
    const sarifPath = path.join(tempDir, "results.sarif");

    try {
      await writeFile(path.join(tempDir, "package.json"), JSON.stringify({ name: "clean-project", version: "1.0.0" }));
      await writeFile(path.join(tempDir, "index.ts"), "export const pi = 3.14;\n");

      const { stdout } = await execFileAsync(process.execPath, [CLI_PATH, "gate", tempDir, "--sarif", sarifPath]);
      expect(stdout).toContain("Status: PASSED");
      expect(stdout).toContain("Gate passed");

      const sarifRaw = await readFile(sarifPath, "utf8");
      const sarif = JSON.parse(sarifRaw);
      expect(sarif.version).toBe("2.1.0");
      expect(sarif.runs[0].tool.driver.name).toBe("ANVIL");
    } finally {
      await safeRm(tempDir);
    }
  });

  it("fails gate (exit code 1) when critical secrets are present", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "anvil-gate-dirty-"));

    try {
      await writeFile(path.join(tempDir, "package.json"), JSON.stringify({ name: "dirty-project", version: "1.0.0" }));
      // Hardcoded token
      await writeFile(
        path.join(tempDir, "leak.ts"),
        "const key = 'sk-proj-123456789012345678901234567890123456789012345678';\n"
      );

      let failed = false;
      try {
        await execFileAsync(process.execPath, [CLI_PATH, "gate", tempDir, "--json"]);
      } catch (err: any) {
        failed = true;
        expect(err.code).toBe(1);
        const report = JSON.parse(err.stdout);
        expect(report.gate).toBe("FAILED");
        expect(report.summary.critical).toBeGreaterThan(0);
      }
      expect(failed).toBe(true);
    } finally {
      await safeRm(tempDir);
    }
  });
});
