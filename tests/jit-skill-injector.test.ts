import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { safeRm } from "./test-helpers.js";
import { injectJitSkills } from "../src/core/jit-skill-injector.js";
import { runHarnessHook } from "../src/core/harness-hooks.js";
import { runNativeHook } from "../src/core/hook-adapters.js";
import { saveInstincts } from "../src/core/instincts.js";

describe("JIT <1k Token Skill Injector & prompt-submit hook", () => {
  const dirs: string[] = [];

  async function makeProject(): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "anvil-jit-"));
    dirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => safeRm(d)));
  });

  it("selects relevant workspace & builtin skills strictly under 1000 tokens", async () => {
    const root = await makeProject();
    await mkdir(path.join(root, ".anvil", "skills"), { recursive: true });
    await writeFile(
      path.join(root, ".anvil", "skills", "oauth-pkce.md"),
      [
        "---",
        "name: OAuth PKCE Verification",
        "description: Enforce state and code_verifier validation for OAuth callbacks.",
        "triggers: oauth, pkce, callback, token",
        "tags: auth, security",
        "---",
        "# OAuth PKCE Verification",
        "- Validate OAuth state HMAC signatures and PKCE code_verifier.",
        "- Never store provider tokens unencrypted outside HttpOnly Secure cookies.",
        "Detailed extra prose repeated to verify truncation. ".repeat(40),
      ].join("\n")
    );

    const result = await injectJitSkills(root, "Implement oauth pkce callback handler with security token validation", {
      includeCatalog: false,
    });

    expect(result.withinBudget).toBe(true);
    expect(result.totalTokens).toBeGreaterThan(0);
    expect(result.totalTokens).toBeLessThanOrEqual(900);
    expect(result.selected.map((s) => s.id)).toContain("oauth-pkce");
    expect(result.formattedContext).toContain("OAuth PKCE Verification");
  });

  it("includes matching project instincts and enforces custom lower token budgets", async () => {
    const root = await makeProject();
    await saveInstincts(root, [
      {
        id: "run-vitest-after-auth",
        trigger: "oauth billing callback",
        action: "Always run vitest on auth callback tests after edits.",
        domain: "testing",
        source: "manual",
        confidence: 0.9,
        occurrences: 4,
        status: "active",
        evidence: ["auth test"],
        createdAt: "2026-11-26T00:00:00.000Z",
        updatedAt: "2026-11-26T00:00:00.000Z",
      },
    ]);

    const result = await injectJitSkills(root, "Update oauth billing callback error handling", {
      maxTokens: 200,
      maxSkills: 2,
      includeCatalog: false,
    });

    expect(result.withinBudget).toBe(true);
    expect(result.totalTokens).toBeLessThanOrEqual(200);
    expect(result.selected.some((s) => s.source === "instinct")).toBe(true);
  });

  it("leaves short generic prompts un-injected so existing harness flows stay minimal", async () => {
    const root = await makeProject();
    const res = await injectJitSkills(root, "add tests");
    expect(res.selected).toHaveLength(0);
    expect(res.formattedContext).toBe("");
    expect(res.totalTokens).toBe(0);
  });

  it("injects JIT context in Claude, Cursor, Codex, and Gemini prompt-submit hooks while blocking live secrets first", async () => {
    const root = await makeProject();
    await mkdir(path.join(root, ".anvil", "skills"), { recursive: true });
    await writeFile(
      path.join(root, ".anvil", "skills", "webhook-verify.md"),
      [
        "---",
        "name: Webhook HMAC Check",
        "triggers: webhook, signature, hmac",
        "description: Verify GitHub webhook HMAC SHA-256 signatures before parsing payloads.",
        "---",
        "Verify X-Hub-Signature-256 with timingSafeEqual before trusting webhook payloads.",
      ].join("\n")
    );

    const prompt = "Fix the webhook signature hmac handler";
    const claudeOut = await runHarnessHook("prompt-submit", JSON.stringify({ cwd: root, prompt }));
    const claudeHook = claudeOut.json?.hookSpecificOutput as Record<string, unknown>;
    expect(claudeHook?.hookEventName).toBe("UserPromptSubmit");
    expect(String(claudeHook?.additionalContext)).toContain("Webhook HMAC Check");

    const cursorOut = await runNativeHook(
      "cursor",
      "beforeSubmitPrompt",
      JSON.stringify({ workspace_roots: [root], prompt })
    );
    expect(cursorOut.json?.continue).toBe(true);
    expect(String(cursorOut.json?.additional_context)).toContain("Webhook HMAC Check");

    const codexOut = await runNativeHook("codex", "UserPromptSubmit", JSON.stringify({ cwd: root, prompt }));
    expect(String((codexOut.json?.hookSpecificOutput as Record<string, unknown>)?.additionalContext)).toContain(
      "Webhook HMAC Check"
    );

    const geminiOut = await runNativeHook("gemini", "BeforeAgent", JSON.stringify({ cwd: root, prompt }));
    expect(String((geminiOut.json?.hookSpecificOutput as Record<string, unknown>)?.additionalContext)).toContain(
      "Webhook HMAC Check"
    );

    // Live secret guard must still block BEFORE any JIT skill injection
    const blocked = await runHarnessHook(
      "prompt-submit",
      JSON.stringify({ cwd: root, prompt: `Fix webhook hmac using ${"ghp_" + "a".repeat(36)}` })
    );
    expect(blocked.json?.decision).toBe("block");
    expect(blocked.json?.hookSpecificOutput).toBeUndefined();
  });

  it("strips nested/reconstructed HTML comments without ReDoS on pathological punctuation inputs", async () => {
    const { resolveInternal } = await import("../src/core/architecture-map.js");
    const { tokenize } = await import("../src/core/consult.js");

    const root = await makeProject();
    await mkdir(path.join(root, ".anvil", "skills"), { recursive: true });
    await writeFile(
      path.join(root, ".anvil", "skills", "clean-comments.md"),
      [
        "---",
        "name: Clean Comment Skill",
        "triggers: comment, strip, hardening",
        "description: Verify recursive comment stripping.",
        "---",
        "Keep rule <!<!--secret-->-- and <!-<!--nested-->- out; always validate signature!",
      ].join("\n")
    );

    const res = await injectJitSkills(root, "Apply comment strip hardening rule", { includeCatalog: false });
    expect(res.formattedContext).toContain("Clean Comment Skill");
    expect(res.formattedContext).not.toContain("<!--");
    expect(res.formattedContext).not.toContain("-->");

    // Verify linear-time behavior on CodeQL pathological strings
    const t0 = Date.now();
    expect(tokenize("-".repeat(20_000) + "oauth!token")).toContain("oauth");
    expect(resolveInternal("src/a.ts", ".".repeat(20_000) + "!invalid", new Set(["src/a.ts"]))).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
