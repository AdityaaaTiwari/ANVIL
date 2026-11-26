import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { safeRm } from "./test-helpers.js";
import { addManualInstinct, learnInstincts, loadInstincts, setInstinctStatus } from "../src/core/instincts.js";
import { compileInstincts, enforceInstincts, formatEnforceResult } from "../src/core/instinct-enforcer.js";
import { runHarnessHook } from "../src/core/harness-hooks.js";

const dirs: string[] = [];
async function workspace(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "anvil-enforce-"));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => safeRm(d)));
});

const coupled = Array.from({ length: 5 }, (_, i) => ({
  subject: `feat(api): change ${i}`,
  files: ["src/api.ts", "tests/api.test.ts"],
})).concat(Array.from({ length: 6 }, (_, i) => ({ subject: `fix(core): tweak ${i}`, files: ["src/core.ts"] })));

describe("instinct-to-guard compiler", () => {
  it("compiles active guard, verification, co-change, convention, and manual block instincts", async () => {
    const root = await workspace();
    const sessionDir = path.join(root, ".anvil", "session");
    await mkdir(sessionDir, { recursive: true });
    await writeFile(
      path.join(sessionDir, "guard.jsonl"),
      [JSON.stringify({ rule: "GUARD-FORCE-PUSH" }), JSON.stringify({ rule: "GUARD-FORCE-PUSH" })].join("\n") + "\n",
      "utf8"
    );
    await writeFile(
      path.join(sessionDir, "observations.jsonl"),
      [
        JSON.stringify({ kind: "verify", script: "lint", status: "failed", files: ["src/a.ts"] }),
        JSON.stringify({ kind: "verify", script: "lint", status: "failed", files: ["src/b.ts"] }),
      ].join("\n") + "\n",
      "utf8"
    );

    await learnInstincts(root, { commits: coupled });
    const candidates = await loadInstincts(root);
    // Candidates must NOT be compiled until approved by a human.
    expect(compileInstincts(candidates).compiled).toEqual([]);

    await setInstinctStatus(
      root,
      candidates.map((c) => c.id),
      "active"
    );
    await addManualInstinct(root, "running `./scripts/deploy.sh`", "never run `./scripts/deploy.sh` directly");
    await addManualInstinct(root, "editing docs/**", "keep examples short", { domain: "docs" });

    const dry = await enforceInstincts(root, { write: false });
    expect(dry.changed).toBe(true);
    expect(dry.written).toBe(false);
    expect(dry.compiled.some((c) => c.kind === "command-rule" && c.rule.id === "INST-GUARD-FORCE-PUSH")).toBe(true);
    expect(dry.compiled.some((c) => c.kind === "command-rule" && c.rule.id === "INST-CONVENTION")).toBe(true);
    expect(dry.compiled.some((c) => c.kind === "command-rule" && c.rule.id.startsWith("INST-CMD-"))).toBe(true);
    expect(dry.compiled.some((c) => c.kind === "verify-script" && c.script === "lint")).toBe(true);
    expect(dry.compiled.some((c) => c.kind === "cochange-rule" && c.rule.id.startsWith("INST-CO-"))).toBe(true);
    expect(dry.skippedAdvisory.some((s) => s.trigger === "editing docs/**")).toBe(true);
    expect(formatEnforceResult(dry)).toContain("Dry run");

    const written = await enforceInstincts(root, { write: true });
    expect(written.written).toBe(true);
    expect(written.addedRuleIds).toContain("INST-GUARD-FORCE-PUSH");
    expect(written.scriptsAdded).toEqual(["lint"]);

    // Second enforce is idempotent.
    const repeat = await enforceInstincts(root, { write: true });
    expect(repeat.changed).toBe(false);
    expect(repeat.written).toBe(false);
  });

  it("preserves hand-written user rules and prunes rejected instincts cleanly", async () => {
    const root = await workspace();
    await mkdir(path.join(root, ".anvil"), { recursive: true });
    await writeFile(
      path.join(root, ".anvil", "harness-hooks.json"),
      JSON.stringify(
        {
          guard: {
            enabled: true,
            rules: [{ id: "USER-NO-PROD-DB", decision: "deny", pattern: "psql .*prod", reason: "Custom user rule" }],
          },
          verifyOnStop: { scripts: ["typecheck"] },
        },
        null,
        2
      ),
      "utf8"
    );

    const manual = await addManualInstinct(root, "running `docker system prune`", "block `docker system prune`");
    await enforceInstincts(root, { write: true });

    const configAfterAdd = JSON.parse(await readFile(path.join(root, ".anvil", "harness-hooks.json"), "utf8")) as {
      guard: { rules: Array<{ id: string }> };
      verifyOnStop: { scripts: string[] };
    };
    expect(configAfterAdd.guard.rules.map((r) => r.id)).toEqual(
      expect.arrayContaining(["USER-NO-PROD-DB", `INST-CMD-${manual.id.slice(5).toUpperCase()}`])
    );
    expect(configAfterAdd.verifyOnStop.scripts).toEqual(["typecheck"]);

    await setInstinctStatus(root, [manual.id], "rejected");
    const pruned = await enforceInstincts(root, { write: true });
    expect(pruned.removedRuleIds).toEqual([`INST-CMD-${manual.id.slice(5).toUpperCase()}`]);

    const configAfterPrune = JSON.parse(await readFile(path.join(root, ".anvil", "harness-hooks.json"), "utf8")) as {
      guard: { rules: Array<{ id: string }> };
    };
    expect(configAfterPrune.guard.rules.map((r) => r.id)).toEqual(["USER-NO-PROD-DB"]);
  });

  it("deterministically denies escalated commands, non-conventional commits, and uncoupled stops via hooks", async () => {
    const root = await workspace();
    const sessionDir = path.join(root, ".anvil", "session");
    await mkdir(path.join(root, "src"), { recursive: true });
    await mkdir(path.join(root, "tests"), { recursive: true });
    await mkdir(sessionDir, { recursive: true });
    await writeFile(
      path.join(sessionDir, "guard.jsonl"),
      JSON.stringify({ rule: "GUARD-FORCE-PUSH" }) + "\n" + JSON.stringify({ rule: "GUARD-FORCE-PUSH" }) + "\n",
      "utf8"
    );

    await learnInstincts(root, { commits: coupled });
    const all = await loadInstincts(root);
    await setInstinctStatus(
      root,
      all.map((i) => i.id),
      "active"
    );
    await addManualInstinct(root, "running `./scripts/deploy.sh`", "never run `./scripts/deploy.sh`");
    await enforceInstincts(root, { write: true, strict: true });

    // Escalated GUARD-FORCE-PUSH must now be denied instead of ask.
    const forcePush = await runHarnessHook(
      "pre-tool",
      JSON.stringify({ cwd: root, tool_name: "Bash", tool_input: { command: "git push --force origin feature" } })
    );
    const fpOut = (
      forcePush.json as { hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string } }
    ).hookSpecificOutput;
    expect(fpOut?.permissionDecision).toBe("deny");
    expect(fpOut?.permissionDecisionReason).toContain("INST-GUARD-FORCE-PUSH");

    // Manual script block works even with leading ./
    const deployOut = await runHarnessHook(
      "pre-tool",
      JSON.stringify({ cwd: root, tool_name: "Bash", tool_input: { command: "./scripts/deploy.sh --prod" } })
    );
    expect(
      (deployOut.json as { hookSpecificOutput?: { permissionDecision?: string } }).hookSpecificOutput
        ?.permissionDecision
    ).toBe("deny");

    // Non-conventional commit blocked in strict mode; conventional commit allowed.
    const badCommit = await runHarnessHook(
      "pre-tool",
      JSON.stringify({ cwd: root, tool_name: "Bash", tool_input: { command: 'git commit -m "wip stuff"' } })
    );
    expect(
      (badCommit.json as { hookSpecificOutput?: { permissionDecision?: string } }).hookSpecificOutput
        ?.permissionDecision
    ).toBe("deny");

    const goodCommit = await runHarnessHook(
      "pre-tool",
      JSON.stringify({ cwd: root, tool_name: "Bash", tool_input: { command: 'git commit -m "feat(api): add route"' } })
    );
    expect(goodCommit.json).toBeUndefined();

    // Stop hook blocks if coupled file was not edited.
    await writeFile(path.join(root, "src/api.ts"), "export const x = 1;\n", "utf8");
    await writeFile(path.join(root, "tests/api.test.ts"), "import 'vitest';\n", "utf8");
    await runHarnessHook(
      "post-edit",
      JSON.stringify({ cwd: root, tool_name: "Edit", tool_input: { file_path: path.join(root, "src/api.ts") } })
    );
    const blockedStop = await runHarnessHook("stop", JSON.stringify({ cwd: root }));
    expect((blockedStop.json as { decision?: string; reason?: string })?.decision).toBe("block");
    expect((blockedStop.json as { reason?: string })?.reason).toContain("tests/api.test.ts");

    // Updating the coupled file satisfies the co-change guard.
    await runHarnessHook(
      "post-edit",
      JSON.stringify({ cwd: root, tool_name: "Edit", tool_input: { file_path: path.join(root, "tests/api.test.ts") } })
    );
    const allowedStop = await runHarnessHook("stop", JSON.stringify({ cwd: root }));
    expect(allowedStop.json).toBeUndefined();
  });

  it("supports anvil instinct enforce and promote --enforce from CLI", async () => {
    const run = (...args: string[]) =>
      execFileSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
        cwd: process.cwd(),
        shell: false,
        encoding: "utf8",
      });
    const root = await workspace();
    const added = await addManualInstinct(root, "running `npm publish`", "never run `npm publish` manually");
    const jsonOut = run("instinct", "enforce", "--write", "--json", root);
    const parsed = JSON.parse(jsonOut) as { written: boolean; addedRuleIds: string[] };
    expect(parsed.written).toBe(true);
    expect(parsed.addedRuleIds).toEqual([`INST-CMD-${added.id.slice(5).toUpperCase()}`]);

    const cand = await learnInstincts(root, { commits: coupled });
    const conv = cand.added.find((i) => i.source === "git-convention")!;
    const promoteOut = run("instinct", "promote", conv.id, "--enforce", root);
    expect(promoteOut).toContain("Promoted 1 instinct(s).");
    expect(promoteOut).toContain("INST-CONVENTION");
  }, 20_000);
});
