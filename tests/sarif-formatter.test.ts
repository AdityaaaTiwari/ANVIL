import { describe, expect, it } from "vitest";
import { generateSarif } from "../src/core/sarif-formatter.js";
import type { SecurityAuditReport } from "../src/core/security-scanner.js";
import type { CodeReviewReport } from "../src/core/code-review.js";

describe("SARIF v2.1.0 generation", () => {
  it("formats security findings and code review findings into standard SARIF JSON", () => {
    const mockSecurity: SecurityAuditReport = {
      scannedFiles: 5,
      durationMs: 12,
      passed: false,
      summary: { critical: 1, high: 0, medium: 0, low: 0, total: 1 },
      findings: [
        {
          id: "sec-1",
          severity: "critical",
          category: "secret",
          file: "src/config.ts",
          line: 14,
          rule: "AWS_ACCESS_KEY",
          description: "Potential hardcoded AWS Access Key ID found",
          remediation: "Move secrets to environment variables",
        },
      ],
    };

    const mockReview: CodeReviewReport = {
      root: "/mock/root",
      generatedAt: new Date().toISOString(),
      scope: "source-files",
      base: "HEAD",
      filesReviewed: ["src/app.ts"],
      warnings: [],
      summary: { high: 1, medium: 0, low: 0 },
      findings: [
        {
          ruleId: "ANVIL-R001",
          severity: "high",
          file: "src/app.ts",
          line: 42,
          title: "Dynamic code evaluation",
          evidence: "eval(userInput)",
          recommendation: "Avoid evaluating generated strings",
          confidence: "heuristic",
        },
      ],
    };

    const sarifJson = generateSarif({
      securityReport: mockSecurity,
      reviewReport: mockReview,
    });

    const parsed = JSON.parse(sarifJson);
    expect(parsed.$schema).toContain("sarif-schema-2.1.0.json");
    expect(parsed.version).toBe("2.1.0");
    expect(parsed.runs.length).toBe(1);
    expect(parsed.runs[0].tool.driver.name).toBe("ANVIL");

    const results = parsed.runs[0].results;
    expect(results.length).toBe(2);

    // Finding 1: Security finding
    const secResult = results.find((r: any) => r.ruleId === "AWS_ACCESS_KEY");
    expect(secResult).toBeDefined();
    expect(secResult.level).toBe("error");
    expect(secResult.locations[0].physicalLocation.artifactLocation.uri).toBe("src/config.ts");
    expect(secResult.locations[0].physicalLocation.region.startLine).toBe(14);

    // Finding 2: Review finding
    const revResult = results.find((r: any) => r.ruleId === "ANVIL-R001");
    expect(revResult).toBeDefined();
    expect(revResult.level).toBe("error");
    expect(revResult.locations[0].physicalLocation.artifactLocation.uri).toBe("src/app.ts");
    expect(revResult.locations[0].physicalLocation.region.startLine).toBe(42);
  });
});
