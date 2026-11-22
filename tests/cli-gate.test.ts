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

  it("supports PR-diff mode with --since flag to evaluate only modified files", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "anvil-gate-diff-cli-"));

    try {
      await writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({ name: "diff-cli-project", version: "1.0.0" })
      );
      await writeFile(
        path.join(tempDir, "legacy.ts"),
        "const key = 'sk-proj-123456789012345678901234567890123456789012345678';\n"
      );

      await execFileAsync("git", ["init", tempDir]);
      await execFileAsync("git", ["-C", tempDir, "config", "user.email", "test@anvil.invalid"]);
      await execFileAsync("git", ["-C", tempDir, "config", "user.name", "ANVIL Tests"]);
      await execFileAsync("git", ["-C", tempDir, "add", "."]);
      await execFileAsync("git", ["-C", tempDir, "commit", "-m", "Initial commit with legacy secret"]);

      // Add a clean file in second commit
      await writeFile(path.join(tempDir, "new-feature.ts"), "export const hello = 'world';\n");
      await execFileAsync("git", ["-C", tempDir, "add", "new-feature.ts"]);
      await execFileAsync("git", ["-C", tempDir, "commit", "-m", "Clean new feature"]);

      // Normal gate fails due to legacy.ts
      let fullFailed = false;
      try {
        await execFileAsync(process.execPath, [CLI_PATH, "gate", tempDir, "--json"]);
      } catch {
        fullFailed = true;
      }
      expect(fullFailed).toBe(true);

      // Gate with --since HEAD~1 passes because modified file new-feature.ts has zero issues!
      const { stdout } = await execFileAsync(process.execPath, [
        CLI_PATH,
        "gate",
        tempDir,
        "--since",
        "HEAD~1",
        "--json",
      ]);
      const report = JSON.parse(stdout);
      expect(report.gate).toBe("PASSED");
      expect(report.summary.critical).toBe(0);
      expect(report.summary.suppressedByDiff).toBeGreaterThan(0);
    } finally {
      await safeRm(tempDir);
    }
  });

  it("supports ingesting external SARIF report with --import-sarif flag", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "anvil-gate-sarif-cli-"));

    try {
      await writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({ name: "sarif-cli-project", version: "1.0.0" })
      );
      await writeFile(path.join(tempDir, "index.ts"), "export const pi = 3.14;\n");

      const externalSarif = {
        version: "2.1.0",
        runs: [
          {
            tool: { driver: { name: "CodeQL" } },
            results: [
              {
                ruleId: "js/sql-injection",
                level: "error",
                message: { text: "Critical database injection vulnerability" },
                locations: [
                  {
                    physicalLocation: {
                      artifactLocation: { uri: "src/server.ts" },
                      region: { startLine: 10 },
                    },
                  },
                ],
              },
            ],
          },
        ],
      };
      const sarifInputPath = path.join(tempDir, "codeql.sarif");
      await writeFile(sarifInputPath, JSON.stringify(externalSarif, null, 2), "utf8");

      let failed = false;
      try {
        await execFileAsync(process.execPath, [CLI_PATH, "gate", tempDir, "--import-sarif", sarifInputPath, "--json"]);
      } catch (err: any) {
        failed = true;
        expect(err.code).toBe(1);
        const report = JSON.parse(err.stdout);
        expect(report.gate).toBe("FAILED");
        expect(report.summary.critical).toBe(1);
      }
      expect(failed).toBe(true);
    } finally {
      await safeRm(tempDir);
    }
  });
});
