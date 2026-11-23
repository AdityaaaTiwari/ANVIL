import { mkdir, mkdtemp, readFile, rm, writeFile, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { decideHook, formatFeedback, hookOutput, hookWorkspace, parseHookInput } from "../src/core/agent-hooks.js";
import {
  applyHarnessPlan,
  hookCommand,
  planHarnessInstall,
  type InstallOptions,
} from "../src/core/harness-installer.js";
import type { GateEvaluation, NormalizedFinding } from "../src/core/policy-engine.js";

function finding(overrides: Partial<NormalizedFinding>): NormalizedFinding {
  return {
    id: "ANVIL-R001",
    source: "review",
    severity: "high",
    confidence: "high",
    file: "src/a.ts",
    line: 3,
    message: "Avoid eval.",
    fingerprint: "f",
    legacyFingerprint: "f",
    ...overrides,
  };
}

function evaluation(passed: boolean, findings: NormalizedFinding[] = []): GateEvaluation {
  return {
    passed,
    violations: passed ? [] : ["High-severity findings exceeded limit: found 1, max allowed 0"],
    activeFindings: findings,
  } as unknown as GateEvaluation;
}

describe("agent stop hook protocol", () => {
  it("guards against loops and aborted runs", () => {
    expect(decideHook("claude", {}).runGate).toBe(true);
    expect(decideHook("claude", { stop_hook_active: true }).runGate).toBe(false);
    expect(decideHook("cursor", { status: "completed", loop_count: 0 }).runGate).toBe(true);
    expect(decideHook("cursor", { status: "completed", loop_count: 2 }).runGate).toBe(false);
    expect(decideHook("cursor", { status: "aborted", loop_count: 0 }).runGate).toBe(false);
    expect(decideHook("cursor", { status: "error" }).runGate).toBe(false);
  });

  it("tolerates missing or broken stdin", () => {
    expect(parseHookInput("")).toEqual({});
    expect(parseHookInput("not json")).toEqual({});
    expect(parseHookInput("[1,2]")).toEqual({});
    expect(parseHookInput('{"cwd":"/x"}')).toEqual({ cwd: "/x" });
  });

  it("finds the workspace from each tool's input", () => {
    expect(hookWorkspace({ cwd: "/claude/project" }, "/fallback")).toBe("/claude/project");
    expect(hookWorkspace({ workspace_roots: ["/cursor/project"] }, "/fallback")).toBe("/cursor/project");
    expect(hookWorkspace({}, "/fallback")).toBe("/fallback");
  });

  it("answers in each tool's format and stays silent on pass", () => {
    expect(hookOutput("claude", evaluation(true))).toBe("");
    expect(hookOutput("cursor", evaluation(true))).toBe("{}");
    expect(hookOutput("claude", undefined)).toBe("");

    const failed = evaluation(false, [finding({})]);
    const claude = JSON.parse(hookOutput("claude", failed));
    expect(claude.decision).toBe("block");
    expect(claude.reason).toContain("src/a.ts:3 ANVIL-R001");
    const cursor = JSON.parse(hookOutput("cursor", failed));
    expect(cursor.followup_message).toContain("src/a.ts:3");
  });

  it("lists only blocking findings, most severe first, capped at ten", () => {
    const findings = [
      finding({ severity: "medium", file: "b.ts", line: 1 }),
      finding({ severity: "critical", file: "z.ts", line: 9 }),
      finding({ severity: "low", file: "low.ts" }),
      finding({ severity: "high", confidence: "low", file: "advisory.ts" }),
      ...Array.from({ length: 12 }, (_, i) => finding({ severity: "medium", file: `m${i}.ts` })),
    ];
    const text = formatFeedback(evaluation(false, findings));
    expect(text.indexOf("z.ts")).toBeLessThan(text.indexOf("b.ts"));
    expect(text).not.toContain("low.ts");
    expect(text).not.toContain("advisory.ts");
    expect(text).toContain("...and 4 more.");
  });
});

describe("anvil install --hooks", () => {
  let root = "";
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = "";
  });
  const exists = (file: string) =>
    access(file).then(
      () => true,
      () => false
    );
  const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"));

  async function setup(): Promise<InstallOptions> {
    root = await mkdtemp(path.join(os.tmpdir(), "anvil-hooks-test-"));
    await mkdir(path.join(root, "home"));
    return {
      projectPath: path.join(root, "p"),
      targets: ["claude", "cursor"],
      hooks: true,
      instructions: false,
      homeDir: path.join(root, "home"),
      platform: "linux",
    };
  }

  it("builds the hook command for each server mode", () => {
    const base = { projectPath: "/p", targets: [] } as InstallOptions;
    expect(hookCommand(base, "claude")).toBe("npx -y anvil-engineering-workbench hook stop --harness claude");
    expect(hookCommand({ ...base, server: "global" }, "cursor")).toBe("anvil hook stop --harness cursor");
    expect(
      hookCommand(
        { ...base, server: "local", localServerScript: path.join("/x", "dist", "mcp", "server.js") },
        "claude"
      )
    ).toBe(`node ${JSON.stringify(path.join("/x", "dist", "cli.js"))} hook stop --harness claude`);
  });

  it("adds stop hooks next to the user's own hooks, idempotently, and uninstall restores them", async () => {
    const options = await setup();
    const project = options.projectPath;
    await mkdir(path.join(project, ".claude"), { recursive: true });
    const userSettings = {
      permissions: { allow: ["Bash(npm test:*)"] },
      hooks: {
        Stop: [{ hooks: [{ type: "command", command: "echo mine" }] }],
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "guard" }] }],
      },
    };
    const before = JSON.stringify(userSettings, null, 2) + "\n";
    await writeFile(path.join(project, ".claude", "settings.json"), before);

    await applyHarnessPlan(await planHarnessInstall(options));
    const settings = await readJson(path.join(project, ".claude", "settings.json"));
    expect(settings.permissions).toEqual(userSettings.permissions);
    expect(settings.hooks.PreToolUse).toEqual(userSettings.hooks.PreToolUse);
    expect(settings.hooks.Stop).toHaveLength(2);
    expect(settings.hooks.Stop[0].hooks[0].command).toBe("echo mine");
    expect(settings.hooks.Stop[1].hooks[0]).toMatchObject({ type: "command", timeout: 180 });
    expect(settings.hooks.Stop[1].hooks[0].command).toContain("hook stop --harness claude");

    const cursor = await readJson(path.join(project, ".cursor", "hooks.json"));
    expect(cursor.version).toBe(1);
    expect(cursor.hooks.stop).toHaveLength(1);
    expect(cursor.hooks.stop[0].command).toContain("hook stop --harness cursor");

    // Re-running, even with a different server mode, keeps exactly one ANVIL hook.
    await applyHarnessPlan(await planHarnessInstall({ ...options, server: "global" }));
    const again = await readJson(path.join(project, ".claude", "settings.json"));
    expect(again.hooks.Stop).toHaveLength(2);
    expect(again.hooks.Stop[1].hooks[0].command).toBe("anvil hook stop --harness claude");
    expect((await planHarnessInstall({ ...options, server: "global" })).every((p) => p.action === "unchanged")).toBe(
      true
    );

    // Uninstall (without --hooks) removes them and restores the user's file byte for byte.
    await applyHarnessPlan(await planHarnessInstall({ ...options, hooks: false }, true));
    expect(await readFile(path.join(project, ".claude", "settings.json"), "utf8")).toBe(before);
    expect(await exists(path.join(project, ".cursor", "hooks.json"))).toBe(false);
  });

  it("removes hooks even with uppercase Windows paths during uninstall", async () => {
    const options = await setup();
    const project = options.projectPath;
    await mkdir(path.join(project, ".claude"), { recursive: true });
    await mkdir(path.join(project, ".cursor"), { recursive: true });

    const windowsClaudeCommand = 'node "D:\\\\ANVIL\\\\dist\\\\cli.js" hook stop --harness claude';
    const windowsCursorCommand = 'node "D:\\\\ANVIL\\\\dist\\\\cli.js" hook stop --harness cursor';

    await writeFile(
      path.join(project, ".claude", "settings.json"),
      JSON.stringify(
        {
          permissions: { allow: ["Bash(*)"] },
          hooks: {
            Stop: [{ hooks: [{ type: "command", command: windowsClaudeCommand, timeout: 180 }] }],
          },
        },
        null,
        2
      ) + "\n"
    );
    await writeFile(
      path.join(project, ".cursor", "hooks.json"),
      JSON.stringify(
        {
          version: 1,
          hooks: {
            stop: [{ command: windowsCursorCommand }],
          },
        },
        null,
        2
      ) + "\n"
    );

    await applyHarnessPlan(await planHarnessInstall({ ...options, hooks: false }, true));
    const claudeCleaned = await readJson(path.join(project, ".claude", "settings.json"));
    expect(claudeCleaned.permissions).toEqual({ allow: ["Bash(*)"] });
    expect(claudeCleaned.hooks?.Stop).toBeUndefined();
    expect(await exists(path.join(project, ".cursor", "hooks.json"))).toBe(false);
  });

  it("does not add hooks unless asked", async () => {
    const options = await setup();
    await applyHarnessPlan(await planHarnessInstall({ ...options, hooks: false }));
    expect(await exists(path.join(options.projectPath, ".claude", "settings.json"))).toBe(false);
    expect(await exists(path.join(options.projectPath, ".cursor", "hooks.json"))).toBe(false);
  });

  it("leaves settings it cannot parse alone", async () => {
    const options = await setup();
    await mkdir(path.join(options.projectPath, ".claude"), { recursive: true });
    const jsonc = '{\n  // mine\n  "hooks": {}\n}\n';
    await writeFile(path.join(options.projectPath, ".claude", "settings.json"), jsonc);
    const plans = await planHarnessInstall(options);
    expect(plans.find((p) => p.path.endsWith("settings.json"))?.action).toBe("skip");
    await applyHarnessPlan(plans);
    expect(await readFile(path.join(options.projectPath, ".claude", "settings.json"), "utf8")).toBe(jsonc);
  });
});
