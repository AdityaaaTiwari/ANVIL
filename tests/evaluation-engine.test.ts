import { describe, expect, it } from "vitest";
import { createRun } from "../src/core/orchestrator.js";
import {
  evaluateRun,
  evaluateRunWithJudge,
  formatEvaluationReport,
  listEvaluationReports,
  loadEvaluationReport,
  loadEvaluationSuites,
  saveEvaluationReport,
  type EvaluationSuite,
} from "../src/core/evaluation-engine.js";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("deterministic agent evaluation", () => {
  it("scores weighted required, forbidden, minWords, and maxWords criteria", () => {
    const run = createRun("Baseline", [{ id: "plan", agent: "planner", title: "Plan", prompt: "Plan work" }]);
    run.tasks[0]!.status = "completed";
    run.tasks[0]!.result = {
      provider: "mock",
      content: "Acceptance criteria are clear. One risk remains.",
    };
    const report = evaluateRun(run, {
      id: "quality-baseline",
      name: "Quality baseline",
      description: "Test",
      cases: [
        {
          id: "planner-output",
          description: "Check plan",
          taskId: "plan",
          criteria: [
            { id: "acceptance", weight: 3, requiredTerms: ["acceptance criteria"] },
            { id: "risk", weight: 1, requiredTerms: ["risk"] },
            { id: "no-false-claim", weight: 2, forbiddenTerms: ["tests passed"] },
            { id: "length-bounds", weight: 2, minWords: 4, maxWords: 20 },
          ],
        },
      ],
    });
    expect(report.score).toBe(100);
    expect(report.passed).toBe(true);
    expect(report.summary.passed).toBe(1);
    expect(formatEvaluationReport(report)).toContain("100/100");
  });

  it("records failing forbiddenTerms, word-count checks, and formats NEEDS REVIEW details", () => {
    const run = createRun("Word check", [{ id: "review", agent: "code-reviewer", title: "Review", prompt: "Review" }]);
    run.tasks[0]!.status = "completed";
    run.tasks[0]!.result = { provider: "mock", content: "badword short" };
    const report = evaluateRun(run, {
      id: "strict-check",
      name: "Strict check",
      description: "Test",
      cases: [
        {
          id: "forbidden-and-length",
          description: "Length and forbidden check",
          agent: "code-reviewer",
          criteria: [
            { id: "clean", weight: 1, forbiddenTerms: ["badword"], minWords: 10 },
            { id: "concise", weight: 1, maxWords: 1 },
          ],
        },
      ],
    });
    expect(report.score).toBe(0);
    expect(report.passed).toBe(false);
    const formatted = formatEvaluationReport(report);
    expect(formatted).toContain("NEEDS REVIEW");
    expect(formatted).toContain("Must not contain: badword");
    expect(formatted).toContain("At least 10 words (found 2)");
    expect(formatted).toContain("At most 1 words (found 2)");
  });

  it("weights failed criteria and reports missing output explicitly", () => {
    const run = createRun("Baseline", [{ id: "review", agent: "code-reviewer", title: "Review", prompt: "Review" }]);
    run.tasks[0]!.status = "completed";
    run.tasks[0]!.result = { provider: "mock", content: "A brief review." };
    const report = evaluateRun(run, {
      id: "review-checks",
      name: "Review checks",
      description: "Test",
      cases: [
        {
          id: "required",
          description: "Need evidence",
          agent: "code-reviewer",
          criteria: [{ id: "evidence", weight: 4, requiredTerms: ["evidence"] }],
        },
        {
          id: "missing",
          description: "Missing role output",
          agent: "security-reviewer",
          criteria: [{ id: "mitigation", weight: 1, requiredTerms: ["mitigation"] }],
        },
      ],
    });
    expect(report.score).toBe(0);
    expect(report.passed).toBe(false);
    expect(report.summary.missingOutput).toBe(1);
    expect(report.cases[1]?.status).toBe("missing-output");
  });

  it("loads validated suites from .anvil/evals and rejects malformed definitions", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "anvil-evals-"));
    try {
      expect(await loadEvaluationSuites(root)).toEqual([]);

      await mkdir(path.join(root, ".anvil", "evals"), { recursive: true });
      await writeFile(
        path.join(root, ".anvil", "evals", "baseline.json"),
        JSON.stringify({
          id: "baseline-suite",
          name: "Baseline",
          description: "Test",
          cases: [
            {
              id: "planner-case",
              description: "Planner",
              agent: "planner",
              criteria: [{ id: "must-plan", weight: 1, requiredTerms: ["plan"] }],
            },
          ],
        })
      );
      const suites = await loadEvaluationSuites(root);
      expect(suites.map((suite) => suite.id)).toEqual(["baseline-suite"]);

      const invalidSuites: unknown[] = [
        null,
        { id: "BAD_ID", name: "x", cases: [] },
        { id: "valid-suite", name: "Valid", cases: [{ id: "BAD", description: "d", agent: "planner", criteria: [] }] },
        {
          id: "valid-suite",
          name: "Valid",
          cases: [
            { id: "dup-case", description: "d", agent: "planner", criteria: [{ id: "c1", weight: 1, minWords: 1 }] },
            { id: "dup-case", description: "d", agent: "planner", criteria: [{ id: "c1", weight: 1, minWords: 1 }] },
          ],
        },
        {
          id: "valid-suite",
          name: "Valid",
          cases: [{ id: "case-1", description: "d", agent: "planner", criteria: [{ id: "bad-crit", weight: 0 }] }],
        },
        {
          id: "valid-suite",
          name: "Valid",
          cases: [
            {
              id: "case-1",
              description: "d",
              agent: "planner",
              criteria: [{ id: "bad-terms", weight: 1, requiredTerms: ["   "] }],
            },
          ],
        },
        {
          id: "valid-suite",
          name: "Valid",
          cases: [
            {
              id: "case-1",
              description: "d",
              agent: "planner",
              criteria: [{ id: "bad-min", weight: 1, minWords: -1 }],
            },
          ],
        },
        {
          id: "valid-suite",
          name: "Valid",
          cases: [
            {
              id: "case-1",
              description: "d",
              agent: "planner",
              criteria: [{ id: "bad-max", weight: 1, maxWords: 0 }],
            },
          ],
        },
        {
          id: "valid-suite",
          name: "Valid",
          cases: [
            {
              id: "case-1",
              description: "d",
              agent: "planner",
              criteria: [{ id: "bad-range", weight: 1, minWords: 10, maxWords: 5 }],
            },
          ],
        },
      ];
      for (const bad of invalidSuites) {
        const badRoot = await mkdtemp(path.join(os.tmpdir(), "anvil-bad-eval-"));
        try {
          await mkdir(path.join(badRoot, ".anvil", "evals"), { recursive: true });
          await writeFile(path.join(badRoot, ".anvil", "evals", "bad.json"), JSON.stringify(bad));
          await expect(loadEvaluationSuites(badRoot)).rejects.toThrow();
        } finally {
          await rm(badRoot, { recursive: true, force: true });
        }
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("saves, lists, and loads evaluation reports with ambiguity and integrity checks", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "anvil-eval-reports-"));
    try {
      const run = createRun("Save test", [{ id: "plan", agent: "planner", title: "Plan", prompt: "Plan" }]);
      run.tasks[0]!.status = "completed";
      run.tasks[0]!.result = { provider: "mock", content: "Detailed plan with steps." };
      const suiteA: EvaluationSuite = {
        id: "suite-alpha",
        name: "Alpha",
        description: "A",
        cases: [{ id: "c1", description: "C1", agent: "planner", criteria: [{ id: "k1", weight: 1, minWords: 2 }] }],
      };
      const suiteB: EvaluationSuite = {
        id: "suite-beta",
        name: "Beta",
        description: "B",
        cases: [{ id: "c1", description: "C1", agent: "planner", criteria: [{ id: "k1", weight: 1, minWords: 2 }] }],
      };

      const reportA = evaluateRun(run, suiteA);
      await saveEvaluationReport(root, reportA);
      // Drop an unrelated JSON file to test filtering in listEvaluationReports.
      await writeFile(path.join(root, ".anvil", "evaluations", "ignored.json"), JSON.stringify({ other: true }));

      const listedOne = await listEvaluationReports(root);
      expect(listedOne).toHaveLength(1);
      expect(await loadEvaluationReport(root, run.id)).toMatchObject({ suiteId: "suite-alpha" });
      expect(await loadEvaluationReport(root, run.id, "suite-alpha")).toMatchObject({ suiteId: "suite-alpha" });

      await expect(loadEvaluationReport(root, "invalid-run-id")).rejects.toThrow(/Invalid ANVIL run identifier/);
      await expect(loadEvaluationReport(root, run.id, "BAD_SUITE")).rejects.toThrow(
        /Invalid evaluation suite identifier/
      );
      await expect(loadEvaluationReport(root, "anvil-missing-run")).rejects.toThrow(/No evaluation report found/);

      const reportB = evaluateRun(run, suiteB);
      await saveEvaluationReport(root, reportB);
      await expect(loadEvaluationReport(root, run.id)).rejects.toThrow(/Multiple evaluation reports exist/);

      await writeFile(
        path.join(root, ".anvil", "evaluations", `${run.id}-suite-corrupt.json`),
        JSON.stringify({ version: 2, runId: run.id, suiteId: "suite-corrupt" })
      );
      await expect(loadEvaluationReport(root, run.id, "suite-corrupt")).rejects.toThrow(
        /Stored evaluation report is invalid/
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("runs a model judge with markdown fences and validates judge schema strictly", async () => {
    const run = createRun("Judge baseline", [
      { id: "review", agent: "code-reviewer", title: "Review", prompt: "Review the change" },
    ]);
    run.tasks[0]!.status = "completed";
    run.tasks[0]!.result = {
      provider: "mock",
      content: "The change has a security risk. Add input validation as mitigation.",
    };
    const suite: EvaluationSuite = {
      id: "judge-suite",
      name: "Judge suite",
      description: "Test",
      cases: [
        {
          id: "review-case",
          description: "Assess security review",
          agent: "code-reviewer",
          criteria: [
            {
              id: "security",
              weight: 1,
              requiredTerms: ["risk"],
              forbiddenTerms: ["unsafe"],
              minWords: 3,
              maxWords: 50,
            },
          ],
        },
      ],
    };

    const report = await evaluateRunWithJudge(run, suite, {
      name: "stub-judge",
      async complete() {
        return {
          provider: "stub",
          content:
            "```json\n" +
            JSON.stringify({
              score: 92,
              rationale: "Identifies a risk and a practical mitigation.",
              strengths: ["Names a concrete risk"],
              improvements: ["Add test evidence"],
              evidence: [{ quote: "The change has a security risk.", criterion: "security" }],
            }) +
            "\n```",
        };
      },
    });
    expect(report.judge.averageScore).toBe(92);
    expect(report.judge.passed).toBe(true);
    expect(report.judge.model).toBeUndefined();
    expect(report.judgedCases[0]?.result.evidence[0]?.quote).toBe("The change has a security risk.");

    // Handles empty output cases cleanly without calling judge.complete.
    const emptyRun = createRun("Empty", [{ id: "plan", agent: "planner", title: "Plan", prompt: "Plan only" }]);
    const emptyReport = await evaluateRunWithJudge(emptyRun, suite, {
      name: "fallback-judge",
      async complete() {
        throw new Error("should not be called");
      },
    });
    expect(emptyReport.judge.averageScore).toBe(0);
    expect(emptyReport.judge.passed).toBe(false);
    expect(emptyReport.judge.provider).toBe("fallback-judge");

    // Rejects malformed judge outputs.
    for (const badResponse of [
      "plain text without json",
      "null",
      JSON.stringify({ score: 150, rationale: "x", strengths: [], improvements: [], evidence: [] }),
      JSON.stringify({
        score: 80,
        rationale: "x",
        strengths: [],
        improvements: [],
        evidence: [{ quote: 123, criterion: "c" }],
      }),
      JSON.stringify({
        score: 99,
        rationale: "Looks good",
        strengths: [],
        improvements: [],
        evidence: [{ quote: "There are no vulnerabilities.", criterion: "security" }],
      }),
    ]) {
      await expect(
        evaluateRunWithJudge(run, suite, {
          name: "bad-judge",
          async complete() {
            return { provider: "stub", content: badResponse };
          },
        })
      ).rejects.toThrow();
    }
  });
});
