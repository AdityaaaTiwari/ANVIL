import { describe, expect, it } from "vitest";
import {
  buildAgentEvaluationIntelligence,
  formatAgentEvaluationIntelligence,
} from "../src/core/agent-evaluation-intelligence.js";
import type { BenchmarkMatrixReport } from "../src/core/benchmark-matrix.js";

// ---------------------------------------------------------------------------
// Flexible report factory — only override what a specific test cares about.
// ---------------------------------------------------------------------------

interface MockReportOptions {
  createdAt?: string;
  score?: number;
  failedCriteria?: string[];
  candidateId?: string;
  provider?: "openai" | "anthropic" | "google" | "ollama" | "claude-code";
  model?: string;
  agent?: string;
  caseId?: string;
  matrixId?: string;
  suiteId?: string;
  goal?: string;
  status?: "completed" | "failed";
}

function createReport(options: MockReportOptions = {}): BenchmarkMatrixReport {
  const {
    createdAt = "2026-01-01T00:00:00.000Z",
    score = 80,
    failedCriteria = [],
    candidateId = "candidate-a",
    provider = "openai",
    model = "model-a",
    agent = "code-reviewer",
    caseId = "case-security",
    matrixId = "matrix-a",
    suiteId = "suite-a",
    goal = "review changes",
    status = "completed",
  } = options;

  const passed = score >= 80;
  const passRate = passed ? 100 : 0;
  const mappedCriteria = failedCriteria.map((id) => ({
    id,
    failedChecks: ["missed a security boundary"],
  }));

  return {
    version: 1,
    matrixId,
    matrixName: "Matrix",
    suiteId,
    goal,
    createdAt,
    results: [
      {
        candidateId,
        provider,
        model,
        repeat: 1,
        runId: "run-a",
        score,
        passed,
        durationMs: 1000,
        estimatedTokens: 500,
        status,
        agentScores: [
          {
            agent,
            caseId,
            score,
            passed,
            skillIds: ["secure-changes"],
            failedCriteria: mappedCriteria,
          },
        ],
      },
    ],
    summary: [
      {
        candidateId,
        provider,
        model,
        trials: 1,
        completed: 1,
        averageScore: score,
        passRate,
        scoreStdDev: 0,
        averageDurationMs: 1000,
        averageEstimatedTokens: 500,
      },
    ],
    agentSummary: [
      {
        candidateId,
        provider,
        model,
        agent,
        trials: 1,
        completed: 1,
        averageScore: score,
        passRate,
        skillsObserved: ["secure-changes"],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// buildAgentEvaluationIntelligence — core aggregation logic
// ---------------------------------------------------------------------------

describe("agent evaluation intelligence", () => {
  // ── happy path ─────────────────────────────────────────────────────────────

  it("builds scorecards, trends and repeated criterion signals", () => {
    const history = [
      createReport({ createdAt: "2026-01-01T00:00:00.000Z", score: 90 }),
      createReport({ createdAt: "2026-01-02T00:00:00.000Z", score: 70, failedCriteria: ["security-boundary"] }),
    ];
    const result = buildAgentEvaluationIntelligence(history);

    expect(result.status).toBe("ready");
    expect(result.cards).toHaveLength(1);

    const card = result.cards[0]!;
    expect(card.scoreTrend).toBe(-20);
    expect(card.improvementAreas).toContain("criterion:security-boundary");
    expect(card.criterionSignals[0]?.criterionId).toBe("security-boundary");
  });

  // ── score trends ───────────────────────────────────────────────────────────

  it("records a positive score trend when the agent improves", () => {
    const history = [
      createReport({ createdAt: "2026-01-01T00:00:00.000Z", score: 60 }),
      createReport({ createdAt: "2026-01-02T00:00:00.000Z", score: 85 }),
    ];
    const result = buildAgentEvaluationIntelligence(history);
    const card = result.cards[0]!;
    expect(card.scoreTrend).toBe(25);
  });

  it("records a zero trend when scores are identical across runs", () => {
    const history = [
      createReport({ createdAt: "2026-01-01T00:00:00.000Z", score: 80 }),
      createReport({ createdAt: "2026-01-02T00:00:00.000Z", score: 80 }),
    ];
    const result = buildAgentEvaluationIntelligence(history);
    const card = result.cards[0]!;
    // Must be exactly 0, not -0 (negative-zero regression).
    expect(Object.is(card.scoreTrend, -0)).toBe(false);
    expect(card.scoreTrend).toBe(0);
  });

  it("does not invent a trend without comparable prior data", () => {
    const result = buildAgentEvaluationIntelligence([
      createReport({ createdAt: "2026-01-01T00:00:00.000Z", score: 90 }),
    ]);
    const card = result.cards[0]!;
    expect(card.scoreTrend).toBeNull();
  });

  // ── insufficient-data ──────────────────────────────────────────────────────

  it("returns insufficient-data for an empty history array", () => {
    const result = buildAgentEvaluationIntelligence([]);
    expect(result.status).toBe("insufficient-data");
    expect(result.cards).toHaveLength(0);
  });

  it("filters by suiteId and reports insufficient data when no reports match", () => {
    const result = buildAgentEvaluationIntelligence(
      [createReport({ createdAt: "2026-01-01T00:00:00.000Z", score: 90 })],
      { suiteId: "missing" }
    );
    expect(result.status).toBe("insufficient-data");
    expect(result.cards).toHaveLength(0);
  });

  it("filters by candidateId and returns insufficient-data when no candidates match", () => {
    const result = buildAgentEvaluationIntelligence(
      [createReport({ createdAt: "2026-01-01T00:00:00.000Z", score: 90 })],
      { candidateId: "ghost-candidate" }
    );
    // Previously the implementation returned status:"ready" with 0 cards here.
    expect(result.status).toBe("insufficient-data");
    expect(result.cards).toHaveLength(0);
  });

  it("returns insufficient-data when agentSummary is absent from all reports", () => {
    const r = createReport({ createdAt: "2026-01-01T00:00:00.000Z", score: 90 });
    r.agentSummary = undefined;
    const result = buildAgentEvaluationIntelligence([r]);
    expect(result.status).toBe("insufficient-data");
  });

  // ── failed runs excluded ───────────────────────────────────────────────────

  it("excludes failed benchmark runs from score and criterion calculations", () => {
    const r = createReport({
      createdAt: "2026-01-01T00:00:00.000Z",
      score: 0,
      failedCriteria: ["auth-bypass"],
      status: "failed",
    });
    const result = buildAgentEvaluationIntelligence([r]);
    const card = result.cards[0]!;
    // No completed score entries → evaluations is 0, no criterion signals.
    expect(card.evaluations).toBe(0);
    expect(card.criterionSignals).toHaveLength(0);
    expect(card.caseMetrics).toHaveLength(0);
  });

  // ── provider/model isolation ───────────────────────────────────────────────

  it("does not mix agent scores from other providers or models", () => {
    const current = createReport({ createdAt: "2026-01-01T00:00:00.000Z", score: 90 });
    current.results.push({
      candidateId: "candidate-a",
      provider: "anthropic",
      model: "different-model",
      repeat: 1,
      runId: "foreign-run",
      score: 0,
      passed: false,
      durationMs: 1000,
      estimatedTokens: 500,
      status: "completed",
      agentScores: [
        { agent: "code-reviewer", caseId: "foreign-case", score: 0, passed: false, skillIds: [], failedCriteria: [] },
      ],
    });
    const result = buildAgentEvaluationIntelligence([current]);
    const card = result.cards[0]!;
    expect(card.caseMetrics.map((item) => item.caseId)).toEqual(["case-security"]);
    expect(card.evaluations).toBe(1);
  });

  it("does not mix history from a different benchmark matrix", () => {
    const current = createReport({ createdAt: "2026-01-02T00:00:00.000Z", score: 90 });
    const unrelated = createReport({ createdAt: "2026-01-01T00:00:00.000Z", score: 10, failedCriteria: ["unrelated"] });
    unrelated.matrixId = "matrix-b";

    const result = buildAgentEvaluationIntelligence([unrelated, current]);
    const card = result.cards[0]!;
    expect(card.evaluations).toBe(1);
    expect(card.scoreTrend).toBeNull();
    expect(card.improvementAreas).toEqual([]);
  });

  // ── date ordering ──────────────────────────────────────────────────────────

  it("sorts reports chronologically even when supplied out of order", () => {
    // Newer report comes first in the array; the trend should still be +10
    // (from 80 on 2026-01-01 up to 90 on 2026-01-02).
    const history = [
      createReport({ createdAt: "2026-01-02T00:00:00.000Z", score: 90 }),
      createReport({ createdAt: "2026-01-01T00:00:00.000Z", score: 80 }),
    ];
    const result = buildAgentEvaluationIntelligence(history);
    const card = result.cards[0]!;
    expect(card.scoreTrend).toBe(10);
  });

  // ── confidence tiers ───────────────────────────────────────────────────────

  it("assigns low confidence for a single run with few scores", () => {
    const result = buildAgentEvaluationIntelligence([
      createReport({ createdAt: "2026-01-01T00:00:00.000Z", score: 80 }),
    ]);
    expect(result.cards[0]!.confidence).toBe("low");
  });

  it("assigns medium confidence with 4+ scores across 2+ eligible runs", () => {
    // Build a report with 4 agentScore entries in a single run.
    const r = createReport({ createdAt: "2026-01-01T00:00:00.000Z", score: 80 });
    const r2 = createReport({ createdAt: "2026-01-02T00:00:00.000Z", score: 85 });
    // Add 3 more agentScore entries so scores.length reaches 4 total across both runs.
    for (const extra of ["case-b", "case-c"] as const) {
      r.results[0]!.agentScores!.push({
        agent: "code-reviewer",
        caseId: extra,
        score: 80,
        passed: true,
        skillIds: [],
        failedCriteria: [],
      });
      r2.results[0]!.agentScores!.push({
        agent: "code-reviewer",
        caseId: extra,
        score: 85,
        passed: true,
        skillIds: [],
        failedCriteria: [],
      });
    }
    const result = buildAgentEvaluationIntelligence([r, r2]);
    expect(result.cards[0]!.confidence).toBe("medium");
  });

  it("assigns high confidence with 10+ scores across 3+ eligible runs", () => {
    const runs = [
      createReport({ createdAt: "2026-01-01T00:00:00.000Z", score: 80 }),
      createReport({ createdAt: "2026-01-02T00:00:00.000Z", score: 82 }),
      createReport({ createdAt: "2026-01-03T00:00:00.000Z", score: 85 }),
    ];
    // Add 4 extra cases per run so scores.length = 3 runs × 5 cases = 15.
    for (const r of runs) {
      for (let i = 2; i <= 5; i++) {
        r.results[0]!.agentScores!.push({
          agent: "code-reviewer",
          caseId: `case-${i}`,
          score: 80,
          passed: true,
          skillIds: [],
          failedCriteria: [],
        });
      }
    }
    const result = buildAgentEvaluationIntelligence(runs);
    expect(result.cards[0]!.confidence).toBe("high");
  });

  // ── strengths ──────────────────────────────────────────────────────────────

  it("identifies a strength when a case scores >= 85 across >= 2 evaluations", () => {
    // Two runs, same case, both scoring 90.
    const r1 = createReport({ createdAt: "2026-01-01T00:00:00.000Z", score: 90 });
    const r2 = createReport({ createdAt: "2026-01-02T00:00:00.000Z", score: 92 });
    const result = buildAgentEvaluationIntelligence([r1, r2]);
    const card = result.cards[0]!;
    expect(card.strengths).toContain("case-security");
  });

  it("does not mark a case as a strength if it has fewer than 2 evaluations", () => {
    const result = buildAgentEvaluationIntelligence([
      createReport({ createdAt: "2026-01-01T00:00:00.000Z", score: 95 }),
    ]);
    expect(result.cards[0]!.strengths).toHaveLength(0);
  });

  // ── recommendations ────────────────────────────────────────────────────────

  it("recommends investigating a score decline of >= 5 points", () => {
    const history = [
      createReport({ createdAt: "2026-01-01T00:00:00.000Z", score: 90 }),
      createReport({ createdAt: "2026-01-02T00:00:00.000Z", score: 82 }),
    ];
    const result = buildAgentEvaluationIntelligence(history);
    expect(result.recommendations.some((r) => r.includes("8-point score decline"))).toBe(true);
  });

  it("does not emit a decline recommendation for a small drop under 5 points", () => {
    const history = [
      createReport({ createdAt: "2026-01-01T00:00:00.000Z", score: 85 }),
      createReport({ createdAt: "2026-01-02T00:00:00.000Z", score: 82 }),
    ];
    const result = buildAgentEvaluationIntelligence(history);
    expect(result.recommendations.some((r) => r.includes("score decline"))).toBe(false);
  });

  it("recommends collecting more trials when evaluations < 3", () => {
    const result = buildAgentEvaluationIntelligence([
      createReport({ createdAt: "2026-01-01T00:00:00.000Z", score: 70 }),
    ]);
    expect(result.recommendations.some((r) => r.includes("collect more trials"))).toBe(true);
  });

  it("recommends targeting improvement areas when weak cases or criteria exist", () => {
    const history = [
      createReport({ createdAt: "2026-01-01T00:00:00.000Z", score: 90 }),
      createReport({ createdAt: "2026-01-02T00:00:00.000Z", score: 70, failedCriteria: ["auth-gap"] }),
    ];
    const result = buildAgentEvaluationIntelligence(history);
    expect(result.recommendations.some((r) => r.includes("targeted evaluation cases"))).toBe(true);
  });

  it("falls back to no-weak-areas recommendation when everything looks good", () => {
    const history = [
      createReport({ createdAt: "2026-01-01T00:00:00.000Z", score: 85 }),
      createReport({ createdAt: "2026-01-02T00:00:00.000Z", score: 88 }),
      createReport({ createdAt: "2026-01-03T00:00:00.000Z", score: 90 }),
    ];
    const result = buildAgentEvaluationIntelligence(history);
    expect(result.recommendations).toContain("No repeated weak areas detected in the analyzed benchmark evidence.");
  });
});

// ---------------------------------------------------------------------------
// formatAgentEvaluationIntelligence — text renderer
// ---------------------------------------------------------------------------

describe("formatAgentEvaluationIntelligence", () => {
  it("includes the effectiveness score in formatted output", () => {
    const history = [
      createReport({ createdAt: "2026-01-01T00:00:00.000Z", score: 90 }),
      createReport({ createdAt: "2026-01-02T00:00:00.000Z", score: 70, failedCriteria: ["security-boundary"] }),
    ];
    const result = buildAgentEvaluationIntelligence(history);
    expect(formatAgentEvaluationIntelligence(result)).toContain("Effectiveness: 70/100");
  });

  it("renders a positive trend with a + prefix", () => {
    const history = [
      createReport({ createdAt: "2026-01-01T00:00:00.000Z", score: 70 }),
      createReport({ createdAt: "2026-01-02T00:00:00.000Z", score: 85 }),
    ];
    const result = buildAgentEvaluationIntelligence(history);
    expect(formatAgentEvaluationIntelligence(result)).toContain("Trend: +15 points");
  });

  it("renders a negative trend without a + prefix", () => {
    const history = [
      createReport({ createdAt: "2026-01-01T00:00:00.000Z", score: 90 }),
      createReport({ createdAt: "2026-01-02T00:00:00.000Z", score: 70 }),
    ];
    const result = buildAgentEvaluationIntelligence(history);
    const formatted = formatAgentEvaluationIntelligence(result);
    expect(formatted).toContain("Trend: -20 points");
    expect(formatted).not.toContain("Trend: +-20 points");
  });

  it("renders 'not enough comparable history' when trend is null", () => {
    const result = buildAgentEvaluationIntelligence([
      createReport({ createdAt: "2026-01-01T00:00:00.000Z", score: 90 }),
    ]);
    expect(formatAgentEvaluationIntelligence(result)).toContain("not enough comparable history");
  });

  it("renders INSUFFICIENT-DATA status correctly", () => {
    const result = buildAgentEvaluationIntelligence([]);
    const formatted = formatAgentEvaluationIntelligence(result);
    expect(formatted).toContain("Status: INSUFFICIENT-DATA");
  });

  it("renders caveats section", () => {
    const result = buildAgentEvaluationIntelligence([
      createReport({ createdAt: "2026-01-01T00:00:00.000Z", score: 80 }),
    ]);
    const formatted = formatAgentEvaluationIntelligence(result);
    expect(formatted).toContain("Caveats:");
    expect(formatted).toContain("benchmark rubric");
  });

  it("renders zero trend as '0 points' not '-0 points'", () => {
    const history = [
      createReport({ createdAt: "2026-01-01T00:00:00.000Z", score: 80 }),
      createReport({ createdAt: "2026-01-02T00:00:00.000Z", score: 80 }),
    ];
    const result = buildAgentEvaluationIntelligence(history);
    const formatted = formatAgentEvaluationIntelligence(result);
    expect(formatted).not.toContain("-0 points");
    expect(formatted).toContain("0 points");
  });
});
