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
});
