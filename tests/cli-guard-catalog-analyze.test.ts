import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { safeRm } from "./test-helpers.js";
import { parseCommandArgs } from "../src/commands/arg-parse.js";
import { runGuard } from "../src/commands/guard.js";
import { runCatalog } from "../src/commands/catalog.js";
import { PROJECT_SKILL_PATHS, runAnalyze } from "../src/commands/analyze.js";

let stdout = "";
let stderr = "";
const originalStdout = process.stdout.write.bind(process.stdout);
const originalStderr = process.stderr.write.bind(process.stderr);
const directories: string[] = [];

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
  await Promise.all(directories.splice(0).map((directory) => safeRm(directory)));
});

async function workspace(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "anvil-cli-gca-"));
  directories.push(directory);
  return directory;
}

describe("parseCommandArgs", () => {
  it("parses one path, value options and flags", () => {
    const parsed = parseCommandArgs(["src", "--days", "3", "--json"], ["--days"], ["--json"]);
    expect(parsed.path).toBe(path.resolve("src"));
    expect(parsed.values.get("--days")).toBe("3");
    expect(parsed.flags.has("--json")).toBe(true);
  });

  it("rejects unknown options, missing values and extra paths", () => {
    expect(() => parseCommandArgs(["--nope"], [], [])).toThrow("Unknown option --nope");
    expect(() => parseCommandArgs(["--days"], ["--days"], [])).toThrow("--days requires a value");
    expect(() => parseCommandArgs(["a", "b"], [], [])).toThrow("at most one project path");
  });
});

describe("anvil guard", () => {
  it("denies a destructive command and exits 2", async () => {
    const root = await workspace();
    await runGuard("guard", ["check", "--path", root, "rm -rf /"]);
    expect(stdout).toContain("deny");
    expect(process.exitCode).toBe(2);
  });

  it("allows a harmless command passed after --", async () => {
    const root = await workspace();
    await runGuard("guard", ["check", "--path", root, "--", "ls", "-la"]);
    expect(stdout).toContain("allow");
    expect(process.exitCode).toBe(0);
  });

  it("returns JSON for a secret file read", async () => {
    const root = await workspace();
    await runGuard("guard", ["check", "--path", root, "--file", ".env", "--json"]);
    const result = JSON.parse(stdout) as { kind: string; verdict: { decision: string } };
    expect(result.kind).toBe("read");
    expect(result.verdict.decision).not.toBe("allow");
  });

  it("reports guard log entries from the session log", async () => {
    const root = await workspace();
    await runGuard("guard", ["log", root, "--json"]);
    expect((JSON.parse(stdout) as { total: number }).total).toBe(0);
  });

  it("shows status for a project without hooks", async () => {
    const root = await workspace();
    await runGuard("guard", ["status", root]);
    expect(stdout).toContain("ANVIL Guard");
    expect(stdout).toContain("anvil install --hooks");
  });

  it("rejects bad limits and unknown subcommands", async () => {
    await runGuard("guard", ["log", "--limit", "0"]);
    expect(stderr).toContain("--limit must be between 1 and 500");
    expect(process.exitCode).toBe(1);
    stderr = "";
    await runGuard("guard", ["bogus"]);
    expect(stderr).toContain('Unknown guard subcommand "bogus"');
  });
});

describe("anvil catalog", () => {
  it("lists items of one kind with ANVIL totals", async () => {
    await runCatalog("catalog", ["--kind", "rule"]);
    expect(stdout).toMatch(/^ANVIL catalog: \d+ agents · \d+ skills · \d+ commands · \d+ rules/);
    expect(stdout).toContain("common/security");
    expect(stdout).not.toMatch(/^ {2}agent /m);
  });

  it("emits JSON without item bodies", async () => {
    await runCatalog("catalog", ["--kind", "agent", "--json"]);
    const items = JSON.parse(stdout) as Array<Record<string, unknown>>;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.kind === "agent" && !("body" in item))).toBe(true);
  });

  it("rejects an unknown kind", async () => {
    await runCatalog("catalog", ["--kind", "widget"]);
    expect(stderr).toContain("--kind must be agent, skill, command or rule");
    expect(process.exitCode).toBe(1);
  });
});

describe("anvil analyze", () => {
  it("profiles a project and writes the anvil-project skill with --write", async () => {
    const root = await workspace();
    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "demo", scripts: { test: "vitest" } }));
    await writeFile(path.join(root, "index.ts"), "export const x = 1;\n");
    await runAnalyze("analyze", [root, "--write"]);
    expect(stdout).toContain("ANVIL repository profile");
    for (const relative of PROJECT_SKILL_PATHS) {
      expect(await readFile(path.join(root, relative), "utf8")).toContain("name: anvil-project");
    }
  });
});
