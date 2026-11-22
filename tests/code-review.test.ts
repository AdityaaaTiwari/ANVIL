import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { safeRm } from "./test-helpers.js";
import { reviewProject } from "../src/core/code-review.js";
const run = promisify(execFile);
describe("code review", () => {
  let root: string | undefined;
  afterEach(async () => {
    if (root) await safeRm(root);
  });
  it("reports heuristic findings with file and line evidence", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "forge-review-"));
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "src", "sample.ts"), "export const safe = 1;");
    await run("git", ["init", root]);
    await run("git", ["-C", root, "config", "user.email", "forge@example.invalid"]);
    await run("git", ["-C", root, "config", "user.name", "FORGE Tests"]);
    await run("git", ["-C", root, "add", "."]);
    await run("git", ["-C", root, "commit", "-m", "baseline"]);
    await writeFile(
      path.join(root, "src", "sample.ts"),
      "export const safe = 1;\neval(input);\nnode.innerHTML = value;\n"
    );
    const report = await reviewProject(root);
    expect(report.findings.some((f) => f.ruleId === "ANVIL-R001" && f.line === 2)).toBe(true);
    expect(report.summary.medium).toBeGreaterThan(0);
  });
  it("supports reviewing all source files without a Git diff", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "forge-review-all-"));
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "src", "x.js"), "new Function('return 1');"); // anvil-disable-line ANVIL-R001
    const report = await reviewProject(root, { all: true });
    expect(report.scope).toBe("source-files");
    expect(report.findings[0]?.ruleId).toBe("ANVIL-R001");
  });

  it("unions rules and reasons when next-line and same-line suppressions target the same line", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "anvil-review-union-"));
    await mkdir(path.join(root, "src"));
    // Line 1: anvil-disable-next-line ANVIL-R001 -- reason one
    // Line 2: eval(input); node.innerHTML = val; // anvil-disable-line ANVIL-R003 -- reason two
    await writeFile(
      path.join(root, "src", "union.ts"),
      "// anvil-disable-next-line ANVIL-R001 -- reason one\neval(input); node.innerHTML = val; // anvil-disable-line ANVIL-R003 -- reason two\n"
    );
    const report = await reviewProject(root, { all: true });
    // Both ANVIL-R001 (eval) and ANVIL-R003 (innerHTML) must be suppressed on line 2
    expect(report.findings).toHaveLength(0);
    expect(report.inlineSuppressions).toHaveLength(2);
    const ruleIds = report.inlineSuppressions.map((s) => s.ruleId);
    expect(ruleIds).toContain("ANVIL-R001");
    expect(ruleIds).toContain("ANVIL-R003");
    const reasons = report.inlineSuppressions.map((s) => s.reason).join("; ");
    expect(reasons).toContain("reason one");
    expect(reasons).toContain("reason two");
  });
});
