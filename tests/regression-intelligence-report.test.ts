import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  compareCheckRuns,
  formatRegressionReport,
  generateRegressionReport,
  type RegressionReport,
} from "../src/core/regression-intelligence.js";
import { saveVerification } from "../src/core/verification-history.js";
import type { VerificationResult } from "../src/core/verification.js";
import { safeRm } from "./test-helpers.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => safeRm(dir)));
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "ANVIL Test",
      GIT_AUTHOR_EMAIL: "test@anvil.local",
      GIT_COMMITTER_NAME: "ANVIL Test",
      GIT_COMMITTER_EMAIL: "test@anvil.local",
    },
  });
}

function makeRun(
  id: string,
  script: string,
  status: VerificationResult["status"],
  durationMs: number,
  output: string,
  projectPath: string,
  finishedAt: string
): VerificationResult {
  return {
    id,
    projectPath,
    script,
    command: `npm run ${script}`,
    status,
    exitCode: status === "passed" ? 0 : 1,
    signal: status === "timed_out" ? "SIGTERM" : null,
    durationMs,
    startedAt: finishedAt,
    finishedAt,
    output,
    outputTruncated: false,
  };
}

describe("regression-intelligence reporting", () => {
  it("handles empty history, stable durations, timed_out runs, and unchanged failure signatures", () => {
    expect(compareCheckRuns([])).toEqual([]);

    const checks = compareCheckRuns([
      makeRun("verify-20261128-aaa11111", "lint", "passed", 100, "ok", "/tmp/p", "2026-11-28T02:00:00Z"),
      makeRun("verify-20261128-aaa11110", "lint", "passed", 150, "ok", "/tmp/p", "2026-11-28T01:00:00Z"),
      makeRun(
        "verify-20261128-bbb22221",
        "e2e",
        "timed_out",
        5000,
        "Error: timeout exceeded",
        "/tmp/p",
        "2026-11-28T02:00:00Z"
      ),
      makeRun(
        "verify-20261128-bbb22220",
        "e2e",
        "failed",
        4000,
        "Error: timeout exceeded",
        "/tmp/p",
        "2026-11-28T01:00:00Z"
      ),
    ]);

    const lint = checks.find((c) => c.script === "lint");
    const e2e = checks.find((c) => c.script === "e2e");
    expect(lint?.state).toBe("stable");
    expect(lint?.durationChangeMs).toBe(-50);
    expect(e2e?.state).toBe("persistent_failure");
    expect(e2e?.newFailureSignature).toBe(false);
    expect(e2e?.durationChangeMs).toBe(1000);
  });

  it("reports warnings cleanly on a non-git workspace with no verification history", async () => {
    const root = await makeTempDir("anvil-reg-nogit-");
    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "tmp-app" }), "utf8");

    const report = await generateRegressionReport(root);
    expect(report.checks).toEqual([]);
    expect(report.changedFiles).toEqual([]);
    expect(report.warnings.length).toBeGreaterThan(0);

    const text = formatRegressionReport(report);
    expect(text).toContain("- Verification records: 0");
    expect(text).toContain("## Warnings");
    expect(text).toContain("No saved verification runs exist yet");
  });

  it("analyzes git commits, impacted modules, and saved verification runs", async () => {
    const root = await makeTempDir("anvil-reg-git-");
    await mkdir(path.join(root, "src"), { recursive: true });
    await mkdir(path.join(root, "tests"), { recursive: true });

    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "tmp-git-app" }), "utf8");
    await writeFile(path.join(root, "src", "math.ts"), "export function add(a: number, b: number) { return a + b; }\n");
    await writeFile(
      path.join(root, "src", "app.ts"),
      'import { add } from "./math.js";\nexport const two = add(1, 1);\n'
    );
    await writeFile(
      path.join(root, "tests", "math.test.ts"),
      'import { add } from "../src/math.js";\nconsole.log(add(1, 2));\n'
    );

    git(root, "init");
    git(root, "add", ".");
    git(root, "commit", "-m", "initial commit");

    await writeFile(
      path.join(root, "src", "math.ts"),
      "export function add(a: number, b: number) { return a + b + 0; }\n"
    );
    git(root, "add", "src/math.ts");
    git(root, "commit", "-m", "touch math");

    await saveVerification(
      root,
      makeRun("verify-20261128-hist0001", "test", "passed", 100, "all tests passed", root, "2026-11-28T01:00:00Z")
    );
    await saveVerification(
      root,
      makeRun(
        "verify-20261128-hist0002",
        "test",
        "failed",
        250,
        "AssertionError: expected 2 to equal 3",
        root,
        "2026-11-28T02:00:00Z"
      )
    );

    const report = await generateRegressionReport(root, "HEAD~1");
    expect(report.summary.checksReviewed).toBe(1);
    expect(report.summary.regressions).toBe(1);
    expect(report.changedFiles.some((f) => f.file.includes("src/math.ts"))).toBe(true);

    const formatted = formatRegressionReport(report);
    expect(formatted).toContain("- **test**: REGRESSION (passed → failed)");
    expect(formatted).toContain("## Changed files");
  });

  it("formats all regression states, signatures, durations, affected modules, and suggested tests", () => {
    const sample: RegressionReport = {
      root: "/tmp/repo",
      generatedAt: "2026-11-28T03:00:00.000Z",
      base: "HEAD~1",
      checks: [
        {
          script: "unit",
          state: "regression",
          latest: makeRun("verify-1", "unit", "failed", 300, "Error: boom", "/tmp/repo", "2026-11-28T03:00:00Z"),
          previous: makeRun("verify-0", "unit", "passed", 200, "ok", "/tmp/repo", "2026-11-28T02:00:00Z"),
          durationChangeMs: 100,
          newFailureSignature: true,
          failureSignature: "error: boom",
        },
        {
          script: "lint",
          state: "recovered",
          latest: makeRun("verify-2", "lint", "passed", 120, "ok", "/tmp/repo", "2026-11-28T03:00:00Z"),
          previous: makeRun("verify-0", "lint", "failed", 200, "error", "/tmp/repo", "2026-11-28T02:00:00Z"),
          durationChangeMs: -80,
          newFailureSignature: null,
          failureSignature: null,
        },
        {
          script: "build",
          state: "persistent_failure",
          latest: makeRun("verify-3", "build", "failed", 500, "Error: tsc", "/tmp/repo", "2026-11-28T03:00:00Z"),
          previous: makeRun("verify-0", "build", "failed", 500, "Error: tsc", "/tmp/repo", "2026-11-28T02:00:00Z"),
          durationChangeMs: 0,
          newFailureSignature: false,
          failureSignature: "error: tsc",
        },
        {
          script: "typecheck",
          state: "stable",
          latest: makeRun("verify-4", "typecheck", "passed", 90, "ok", "/tmp/repo", "2026-11-28T03:00:00Z"),
          previous: null,
          durationChangeMs: null,
          newFailureSignature: null,
          failureSignature: null,
        },
        {
          script: "smoke",
          state: "baseline",
          latest: makeRun("verify-5", "smoke", "passed", 50, "ok", "/tmp/repo", "2026-11-28T03:00:00Z"),
          previous: null,
          durationChangeMs: null,
          newFailureSignature: null,
          failureSignature: null,
        },
      ],
      changedFiles: [{ status: "M", file: "src/core/x.ts" }],
      affectedModules: [{ file: "src/core/x.ts", affected: ["src/cli.ts"] }],
      suggestedTests: [{ file: "tests/x.test.ts", reason: "imports x.ts" }],
      warnings: ["working tree dirty"],
      summary: {
        regressions: 1,
        recovered: 1,
        persistentFailures: 1,
        stable: 1,
        baselines: 1,
        checksReviewed: 5,
      },
    };

    const output = formatRegressionReport(sample);
    expect(output).toContain("- **unit**: REGRESSION (passed → failed); duration +100 ms [new failure signature]");
    expect(output).toContain("- **lint**: RECOVERED (failed → passed); duration -80 ms");
    expect(output).toContain("- **build**: PERSISTENT_FAILURE (failed → failed); duration +0 ms");
    expect(output).toContain("- **typecheck**: STABLE (baseline)");
    expect(output).toContain("- **smoke**: BASELINE (baseline)");
    expect(output).toContain("## Potentially affected modules");
    expect(output).toContain("## Suggested test targets");
    expect(output).toContain("## Warnings");
  });
});
