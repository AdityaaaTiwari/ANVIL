import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { evaluateGate, loadGatePolicy, loadBaseline, generateBaselineJson } from "../src/core/policy-engine.js";

async function createTempWorkspace(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "anvil-policy-test-"));
}

describe("ANVIL Policy-as-Code & Gate Baseline Engine", () => {
  it("evaluates a clean workspace as passed under default policy", async () => {
    const root = await createTempWorkspace();
    try {
      await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "clean-app" }));
      await writeFile(path.join(root, "index.ts"), 'console.log("hello world");\n');

      const evaluation = await evaluateGate(root);
      expect(evaluation.passed).toBe(true);
      expect(evaluation.violations.length).toBe(0);
      expect(evaluation.summary.critical).toBe(0);
      expect(evaluation.summary.high).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails the gate under default policy when a critical secret is present", async () => {
    const root = await createTempWorkspace();
    try {
      await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "secret-app" }));
      await writeFile(path.join(root, "config.ts"), 'const key = "sk-12345678901234567890123456789012";\n');

      const evaluation = await evaluateGate(root);
      expect(evaluation.passed).toBe(false);
      expect(evaluation.violations.length).toBeGreaterThan(0);
      expect(evaluation.violations[0]).toContain("Critical findings exceeded limit");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("changes gate outcome when a custom policy configures maxCritical > 0", async () => {
    const root = await createTempWorkspace();
    try {
      await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "custom-policy-app" }));
      await writeFile(path.join(root, "config.ts"), 'const key = "sk-12345678901234567890123456789012";\n');

      // 1. Under default policy, it fails
      const defaultEval = await evaluateGate(root);
      expect(defaultEval.passed).toBe(false);

      // 2. Write custom policy allowing up to 1 critical finding
      const customPolicyPath = path.join(root, "custom-policy.json");
      await writeFile(
        customPolicyPath,
        JSON.stringify({
          version: 1,
          security: {
            maxCritical: 1,
            maxHigh: 0,
            maxMedium: 10,
            failOnSecrets: false,
          },
        })
      );

      // 3. Under custom policy, it passes!
      const customEval = await evaluateGate(root, { policyPath: customPolicyPath });
      expect(customEval.passed).toBe(true);
      expect(customEval.violations.length).toBe(0);
      expect(customEval.summary.critical).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("loads .anvil/policy.json automatically from workspace root", async () => {
    const root = await createTempWorkspace();
    try {
      await mkdir(path.join(root, ".anvil"), { recursive: true });
      await writeFile(
        path.join(root, ".anvil", "policy.json"),
        JSON.stringify({
          version: 1,
          security: {
            maxCritical: 5,
            maxHigh: 5,
            maxMedium: 20,
            failOnSecrets: false,
          },
        })
      );

      const { policy, source } = await loadGatePolicy(root);
      expect(policy.security.maxCritical).toBe(5);
      expect(policy.security.maxHigh).toBe(5);
      expect(source).toContain("policy.json");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("suppresses known existing findings using --baseline so gate passes on legacy codebases", async () => {
    const root = await createTempWorkspace();
    try {
      await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "baseline-app" }));
      await writeFile(path.join(root, "legacy.ts"), 'const key = "sk-12345678901234567890123456789012";\n');

      // 1. First run without baseline fails
      const unbaselined = await evaluateGate(root);
      expect(unbaselined.passed).toBe(false);
      expect(unbaselined.activeFindings.length).toBeGreaterThan(0);

      // 2. Generate baseline JSON from findings
      const baselineJson = generateBaselineJson(unbaselined.activeFindings);
      const baselinePath = path.join(root, "baseline.json");
      await writeFile(baselinePath, baselineJson, "utf8");

      // 3. Second run with baseline suppresses the finding and PASSES!
      const baselined = await evaluateGate(root, { baselinePath });
      expect(baselined.passed).toBe(true);
      expect(baselined.violations.length).toBe(0);
      expect(baselined.summary.suppressedByBaseline).toBe(1);
      expect(baselined.summary.critical).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails the gate on medium findings when failOnWarnings is true", async () => {
    const root = await createTempWorkspace();
    try {
      await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "warning-app" }));
      // div.innerHTML triggers ANVIL-R003 which has severity: "medium"
      await writeFile(
        path.join(root, "view.ts"),
        "export function render(el: any, html: string) { el.innerHTML = html; }\n"
      );

      // Normal gate without failOnWarnings passes (maxMedium defaults to 10)
      const normalEval = await evaluateGate(root);
      expect(normalEval.passed).toBe(true);
      expect(normalEval.summary.medium).toBeGreaterThan(0);

      // Gate with failOnWarnings = true fails
      const strictEval = await evaluateGate(root, { failOnWarnings: true });
      expect(strictEval.passed).toBe(false);
      expect(strictEval.violations.some((v) => v.includes("Medium-severity findings exceeded limit"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("strictly fails-closed when .anvil/policy.json contains malformed JSON or invalid schema", async () => {
    const root = await createTempWorkspace();
    try {
      await mkdir(path.join(root, ".anvil"), { recursive: true });
      // Malformed JSON
      await writeFile(path.join(root, ".anvil", "policy.json"), "{ invalid: json, broken: [");

      await expect(loadGatePolicy(root)).rejects.toThrow(/Failed to parse policy JSON/);
      await expect(evaluateGate(root)).rejects.toThrow(/Failed to parse policy JSON/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("enforces failOnSecrets by failing gate when a secret is detected", async () => {
    const root = await createTempWorkspace();
    try {
      await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "secret-check" }));
      await writeFile(path.join(root, "app.ts"), 'const token = "ghp_123456789012345678901234567890123456";\n');

      const customPolicyPath = path.join(root, "policy.json");
      await writeFile(
        customPolicyPath,
        JSON.stringify({
          version: 1,
          security: {
            maxCritical: 5,
            maxHigh: 5,
            maxMedium: 10,
            failOnSecrets: true,
          },
        })
      );

      const evaluation = await evaluateGate(root, { policyPath: customPolicyPath });
      expect(evaluation.passed).toBe(false);
      expect(evaluation.violations.some((v) => v.includes("Policy forbids hardcoded secrets"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("preserves baseline suppression even when line numbers shift above the finding", async () => {
    const root = await createTempWorkspace();
    try {
      await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "shift-test" }));
      await writeFile(
        path.join(root, "code.ts"),
        'export function test() {\n  // line 2\n  const key = "sk-12345678901234567890123456789012";\n}\n'
      );

      // 1. Initial run and generate baseline
      const initial = await evaluateGate(root);
      const baselineJson = generateBaselineJson(initial.activeFindings);
      const baselinePath = path.join(root, "baseline.json");
      await writeFile(baselinePath, baselineJson, "utf8");

      // 2. Insert 10 new lines at top of code.ts so the finding shifts from line 3 down to line 13
      const shiftedCode =
        "// shift 1\n// shift 2\n// shift 3\n// shift 4\n// shift 5\n// shift 6\n// shift 7\n// shift 8\n// shift 9\n// shift 10\n" +
        'export function test() {\n  // line 2\n  const key = "sk-12345678901234567890123456789012";\n}\n';
      await writeFile(path.join(root, "code.ts"), shiftedCode);

      // 3. Gate with content-hash baseline still PASSES!
      const afterShift = await evaluateGate(root, { baselinePath });
      expect(afterShift.passed).toBe(true);
      expect(afterShift.summary.suppressedByBaseline).toBe(1);
      expect(afterShift.summary.critical).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects unrecognized keys or typos in policy file due to strict schema validation", async () => {
    const root = await createTempWorkspace();
    try {
      await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "typo-app" }));
      const typoPolicyPath = path.join(root, "typo-policy.json");
      await writeFile(
        typoPolicyPath,
        JSON.stringify({
          version: 1,
          security: {
            maxCritcal: 5, // Typo! Should be maxCritical
          },
        })
      );

      await expect(evaluateGate(root, { policyPath: typoPolicyPath })).rejects.toThrow(
        /Policy schema validation failed.*maxCritcal/
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("enforces allowInlineSuppressions: false when code contains inline suppressions", async () => {
    const root = await createTempWorkspace();
    try {
      await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "suppression-app" }));
      await writeFile(
        path.join(root, "view.ts"),
        "export function render(el: any) {\n  el.innerHTML = 'test'; // anvil-disable-line ANVIL-R003\n}\n"
      );

      // 1. Under default policy (allowInlineSuppressions: false), inline suppression fails the gate!
      const defaultEval = await evaluateGate(root);
      expect(defaultEval.passed).toBe(false);
      expect(defaultEval.violations.some((v) => v.includes("Policy forbids inline suppressions"))).toBe(true);

      // 2. Under permissive policy with allowInlineSuppressions: true, gate PASSES!
      const permissivePolicyPath = path.join(root, "permissive-policy.json");
      await writeFile(
        permissivePolicyPath,
        JSON.stringify({
          version: 1,
          quality: {
            allowInlineSuppressions: true,
          },
        })
      );

      const permissiveEval = await evaluateGate(root, { policyPath: permissivePolicyPath });
      expect(permissiveEval.passed).toBe(true);
      expect(permissiveEval.summary.inlineSuppressions).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("evaluates disallowedTools using exact command word boundaries, ignoring substrings like format or information", async () => {
    const root = await createTempWorkspace();
    try {
      // package.json with scripts containing "format" and "information", but NOT the tool "rm"
      await writeFile(
        path.join(root, "package.json"),
        JSON.stringify({
          name: "format-app",
          scripts: {
            "format:check": "prettier --check .",
            info: "node -e 'console.log(\"information\")'",
          },
        })
      );
      await writeFile(path.join(root, "index.ts"), 'console.log("clean formatting");\n');

      const disallowedPolicyPath = path.join(root, "disallowed-policy.json");
      await writeFile(
        disallowedPolicyPath,
        JSON.stringify({
          version: 1,
          sandbox: {
            disallowedTools: ["rm"],
          },
        })
      );

      // 1. "rm" should NOT match "format" or "information"!
      const cleanEval = await evaluateGate(root, { policyPath: disallowedPolicyPath });
      expect(cleanEval.passed).toBe(true);
      expect(cleanEval.violations.length).toBe(0);

      // 2. Now add a script that invokes "rm -rf dist"
      await writeFile(
        path.join(root, "package.json"),
        JSON.stringify({
          name: "format-app",
          scripts: {
            "format:check": "prettier --check .",
            clean: "rm -rf dist",
          },
        })
      );

      const failedEval = await evaluateGate(root, { policyPath: disallowedPolicyPath });
      expect(failedEval.passed).toBe(false);
      expect(failedEval.violations.some((v) => v.includes("disallowed tool 'rm'"))).toBe(true);
      expect(failedEval.violations.some((v) => v.includes("package.json script 'clean' invokes 'rm'"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("enforces requireSuppressionReason: true when inline suppressions lack justifications", async () => {
    const root = await createTempWorkspace();
    try {
      await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "reason-app" }));
      // 1. Code with suppression lacking reason
      await writeFile(
        path.join(root, "view.ts"),
        "export function render(el: any) {\n  el.innerHTML = 'test'; // anvil-disable-line ANVIL-R003\n}\n"
      );

      const requireReasonPolicyPath = path.join(root, "reason-policy.json");
      await writeFile(
        requireReasonPolicyPath,
        JSON.stringify({
          version: 1,
          quality: {
            allowInlineSuppressions: true,
            requireSuppressionReason: true,
          },
        })
      );

      // Should fail because no justification reason was provided
      const failedEval = await evaluateGate(root, { policyPath: requireReasonPolicyPath });
      expect(failedEval.passed).toBe(false);
      expect(failedEval.violations.some((v) => v.includes("Policy requires suppression reasons"))).toBe(true);

      // 2. Now update suppression to provide explicit reason with '--'
      await writeFile(
        path.join(root, "view.ts"),
        "export function render(el: any) {\n  el.innerHTML = 'test'; // anvil-disable-line ANVIL-R003 -- verified sanitized DOM\n}\n"
      );

      const passedEval = await evaluateGate(root, { policyPath: requireReasonPolicyPath });
      expect(passedEval.passed).toBe(true);
      expect(passedEval.violations.length).toBe(0);
      expect(passedEval.inlineSuppressions[0]?.reason).toBe("verified sanitized DOM");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("emits advisory notice in evaluation.warnings when sandbox resource limits are configured", async () => {
    const root = await createTempWorkspace();
    try {
      await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "sandbox-app" }));
      await writeFile(path.join(root, "index.ts"), 'console.log("sandbox test");\n');

      const sandboxPolicyPath = path.join(root, "sandbox-policy.json");
      await writeFile(
        sandboxPolicyPath,
        JSON.stringify({
          version: 1,
          sandbox: {
            maxMemory: "64m",
            maxCpus: 1.5,
          },
        })
      );

      const evaluation = await evaluateGate(root, { policyPath: sandboxPolicyPath });
      expect(evaluation.passed).toBe(true);
      expect(evaluation.warnings.length).toBeGreaterThan(0);
      expect(evaluation.warnings[0]).toContain("Sandbox limits");
      expect(evaluation.warnings[0]).toContain("advisory");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not emit sandbox advisory warnings when only disallowedTools is configured", async () => {
    const root = await createTempWorkspace();
    try {
      await writeFile(
        path.join(root, "package.json"),
        JSON.stringify({ name: "disallowed-app", scripts: { test: "vitest" } })
      );
      await writeFile(path.join(root, "index.ts"), 'console.log("clean");\n');

      const policyPath = path.join(root, "custom-policy.json");
      await writeFile(
        policyPath,
        JSON.stringify({
          version: 1,
          sandbox: {
            disallowedTools: ["curl"],
          },
        })
      );

      const evaluation = await evaluateGate(root, { policyPath });
      expect(evaluation.passed).toBe(true);
      const advisoryWarnings = evaluation.warnings.filter((w) => w.includes("Sandbox limits"));
      expect(advisoryWarnings).toHaveLength(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("demotes low-confidence heuristic findings to advisory notices under default minConfidence=medium", async () => {
    const root = await createTempWorkspace();
    try {
      await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "confidence-app" }));
      // Match inside string description - low confidence heuristic
      await writeFile(
        path.join(root, "docs.ts"),
        'export const guide = "Never use eval(untrustedString) in production code";\n'
      );

      // Under default policy (minConfidence="medium"), low-confidence finding is advisory and does not fail gate
      const evaluation = await evaluateGate(root);
      expect(evaluation.passed).toBe(true);
      expect(evaluation.violations.length).toBe(0);
      expect(evaluation.summary.critical).toBe(0);
      expect(evaluation.summary.high).toBe(0);
      expect(evaluation.summary.advisoryLowConfidence).toBe(1);
      expect(evaluation.warnings.some((w) => w.includes("demoted to non-blocking advisory"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails gate on low-confidence finding when minConfidence is set to low", async () => {
    const root = await createTempWorkspace();
    try {
      await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "strict-confidence-app" }));
      await writeFile(
        path.join(root, "docs.ts"),
        'export const guide = "Never use eval(untrustedString) in production code";\n'
      );

      const strictPolicyPath = path.join(root, "policy.json");
      await writeFile(
        strictPolicyPath,
        JSON.stringify({
          version: 1,
          security: { maxCritical: 0, maxHigh: 0, maxMedium: 10, failOnSecrets: true },
          quality: { minConfidence: "low" },
        })
      );

      // When minConfidence="low", even the string match counts as high severity and fails maxHigh=0 limit
      const evaluation = await evaluateGate(root, { policyPath: strictPolicyPath });
      expect(evaluation.passed).toBe(false);
      expect(evaluation.violations.some((v) => v.includes("High-severity findings exceeded limit"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("ingests external SARIF reports from linters/security tools and enforces gate thresholds", async () => {
    const root = await createTempWorkspace();
    try {
      await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "sarif-ingest-app" }));
      await writeFile(path.join(root, "clean.ts"), "export const pi = 3.14;\n");

      // Mock external Semgrep SARIF file with a critical SQL injection finding
      const semgrepSarif = {
        version: "2.1.0",
        runs: [
          {
            tool: { driver: { name: "semgrep" } },
            results: [
              {
                ruleId: "javascript.lang.security.injection.sql-injection",
                level: "error",
                message: { text: "Detected user-controlled input in database query string" },
                locations: [
                  {
                    physicalLocation: {
                      artifactLocation: { uri: "src/db.ts" },
                      region: { startLine: 42 },
                    },
                  },
                ],
              },
            ],
          },
        ],
      };
      const sarifPath = path.join(root, "semgrep.sarif");
      await writeFile(sarifPath, JSON.stringify(semgrepSarif, null, 2), "utf8");

      // Ingesting the external SARIF report introduces a critical finding that fails the gate
      const evaluation = await evaluateGate(root, { externalSarifPaths: [sarifPath] });
      expect(evaluation.passed).toBe(false);
      expect(evaluation.summary.critical).toBe(1);
      expect(evaluation.activeFindings.some((f) => f.id === "javascript.lang.security.injection.sql-injection")).toBe(
        true
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("suppresses violations in untouched files when diff-only mode is active", async () => {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(execFile);

    const root = await createTempWorkspace();
    try {
      await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "diff-gate-app" }));
      // Legacy file with a hardcoded secret
      await writeFile(path.join(root, "legacy.ts"), 'const token = "sk-12345678901234567890123456789012";\n');

      await execAsync("git", ["init", root]);
      await execAsync("git", ["-C", root, "config", "user.email", "test@anvil.invalid"]);
      await execAsync("git", ["-C", root, "config", "user.name", "ANVIL Test"]);
      await execAsync("git", ["-C", root, "add", "."]);
      await execAsync("git", ["-C", root, "commit", "-m", "Initial legacy commit"]);

      // Now create a new PR commit that adds a clean file WITHOUT touching legacy.ts
      await writeFile(path.join(root, "feature.ts"), "export const feature = 'awesome';\n");
      await execAsync("git", ["-C", root, "add", "feature.ts"]);
      await execAsync("git", ["-C", root, "commit", "-m", "Add new feature"]);

      // Full gate without diff mode fails due to legacy.ts secret
      const fullEvaluation = await evaluateGate(root);
      expect(fullEvaluation.passed).toBe(false);
      expect(fullEvaluation.summary.critical).toBeGreaterThan(0);

      // Gate in diff mode relative to HEAD~1 PASSES because feature.ts is clean!
      const diffEvaluation = await evaluateGate(root, { since: "HEAD~1" });
      expect(diffEvaluation.passed).toBe(true);
      expect(diffEvaluation.summary.critical).toBe(0);
      expect(diffEvaluation.summary.suppressedByDiff).toBeGreaterThan(0);
      expect(diffEvaluation.diffBase).toBe("HEAD~1");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
