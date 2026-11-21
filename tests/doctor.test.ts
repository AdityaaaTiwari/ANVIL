import { afterEach, describe, expect, it, vi } from "vitest";
import { formatDoctorReport, runDoctorChecks, fixDoctorIssues } from "../src/core/doctor.js";
import path from "node:path";
import os from "node:os";
import { mkdtemp, mkdir } from "node:fs/promises";
import { safeRm } from "./test-helpers.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("FORGE doctor diagnostics", () => {
  it("runs system health checks and returns a valid DoctorReport structure", async () => {
    const report = await runDoctorChecks();
    expect(report).toBeDefined();
    expect(["healthy", "degraded", "critical"]).toContain(report.overallStatus);
    expect(typeof report.summary.ok).toBe("number");
    expect(typeof report.summary.warn).toBe("number");
    expect(typeof report.summary.fail).toBe("number");
    expect(report.summary.ok + report.summary.warn + report.summary.fail).toBe(report.checks.length);
    expect(Date.parse(report.checkedAt)).not.toBeNaN();

    const checkNames = report.checks.map((c) => c.name);
    expect(checkNames).toContain("Node.js runtime");
    expect(checkNames).toContain("Git CLI");
    expect(checkNames).toContain("OpenAI provider");
    expect(checkNames).toContain("Anthropic provider");
    expect(checkNames).toContain("Google Gemini provider");
  });

  it("identifies configured provider API keys when environment variables are set", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");

    const report = await runDoctorChecks();
    const openaiCheck = report.checks.find((c) => c.name === "OpenAI provider");
    const anthropicCheck = report.checks.find((c) => c.name === "Anthropic provider");
    const geminiCheck = report.checks.find((c) => c.name === "Google Gemini provider");

    expect(openaiCheck?.status).toBe("ok");
    expect(anthropicCheck?.status).toBe("ok");
    expect(geminiCheck?.status).toBe("ok");
  });

  it("warns about missing API keys when environment variables are unset", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GOOGLE_API_KEY", "");

    const report = await runDoctorChecks();
    const openaiCheck = report.checks.find((c) => c.name === "OpenAI provider");
    const anthropicCheck = report.checks.find((c) => c.name === "Anthropic provider");
    const geminiCheck = report.checks.find((c) => c.name === "Google Gemini provider");

    expect(openaiCheck?.status).toBe("warn");
    expect(anthropicCheck?.status).toBe("warn");
    expect(geminiCheck?.status).toBe("warn");
  });

  it("checks workspace path existence and .forge directory presence", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "forge-doc-test-"));
    try {
      // First: without .forge
      const report1 = await runDoctorChecks(tmp);
      const wsCheck1 = report1.checks.find((c) => c.name === "Project workspace");
      const forgeCheck1 = report1.checks.find((c) => c.name === "FORGE configuration");
      expect(wsCheck1?.status).toBe("ok");
      expect(forgeCheck1?.status).toBe("warn");

      // Second: with .forge
      await mkdir(path.join(tmp, ".forge"));
      const report2 = await runDoctorChecks(tmp);
      const forgeCheck2 = report2.checks.find((c) => c.name === "FORGE configuration");
      expect(forgeCheck2?.status).toBe("ok");
    } finally {
      await safeRm(tmp);
    }
  });

  it("marks workspace status as fail if target path does not exist", async () => {
    const nonExistent = path.join(os.tmpdir(), "forge-nonexistent-" + Date.now());
    const report = await runDoctorChecks(nonExistent);
    const wsCheck = report.checks.find((c) => c.name === "Project workspace");
    expect(wsCheck?.status).toBe("fail");
    expect(report.overallStatus).toBe("critical");
  });

  it("formats report with clean text and status badges", () => {
    const mockReport = {
      overallStatus: "healthy" as const,
      summary: { ok: 2, warn: 0, fail: 0 },
      checks: [
        { name: "Node.js runtime", status: "ok" as const, detail: "v22.15.0" },
        { name: "Git CLI", status: "ok" as const, detail: "git version 2.40.0" },
      ],
      checkedAt: new Date().toISOString(),
    };

    const text = formatDoctorReport(mockReport);
    expect(text).toContain("ANVIL / FORGE Doctor — System Health Check");
    expect(text).toContain("[OK]   Node.js runtime");
    expect(text).toContain("Overall Status: HEALTHY");
  });

  it("formats report displaying warnings and failures", () => {
    const mockReport = {
      overallStatus: "critical" as const,
      summary: { ok: 1, warn: 1, fail: 1 },
      checks: [
        { name: "Node.js runtime", status: "ok" as const, detail: "v22.15.0" },
        { name: "Docker daemon", status: "warn" as const, detail: "Docker not running" },
        { name: "Project workspace", status: "fail" as const, detail: "Not found" },
      ],
      checkedAt: new Date().toISOString(),
    };

    const text = formatDoctorReport(mockReport);
    expect(text).toContain("[WARN] Docker daemon");
    expect(text).toContain("[FAIL] Project workspace");
    expect(text).toContain("Overall Status: CRITICAL (1 OK, 1 WARN, 1 FAIL)");
  });

  it("scaffolds missing .anvil, .gitignore, and .env.example with fixDoctorIssues", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "forge-doc-fix-"));
    try {
      const result = await fixDoctorIssues(tmp);
      expect(result.repaired.length).toBeGreaterThanOrEqual(3);
      expect(result.repaired.some((r) => r.includes(".anvil"))).toBe(true);
      expect(result.repaired.some((r) => r.includes(".gitignore"))).toBe(true);
      expect(result.repaired.some((r) => r.includes(".env.example"))).toBe(true);
    } finally {
      await safeRm(tmp);
    }
  });
});
