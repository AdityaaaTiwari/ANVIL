import type { BenchmarkMatrixReport } from "./benchmark-matrix.js";

export interface AgentCaseMetric {
  caseId: string;
  evaluations: number;
  averageScore: number;
  passRate: number;
}

export interface AgentCriterionSignal {
  criterionId: string;
  failures: number;
  evaluations: number;
  failureRate: number;
}

export interface AgentEffectivenessCard {
  candidateId: string;
  provider: string;
  model: string;
  agent: string;
  /** Total agent-score entries collected across all matched historical runs. */
  evaluations: number;
  /** Average score from the most-recent run's agentSummary entry. */
  averageScore: number;
  /** Pass rate from the most-recent run's agentSummary entry. */
  passRate: number;
  scoreTrend: number | null;
  caseMetrics: AgentCaseMetric[];
  criterionSignals: AgentCriterionSignal[];
  strengths: string[];
  improvementAreas: string[];
  confidence: "low" | "medium" | "high";
}

export interface AgentEvaluationIntelligence {
  status: "ready" | "insufficient-data";
  suiteId: string;
  runsAnalyzed: number;
  generatedAt: string;
  cards: AgentEffectivenessCard[];
  recommendations: string[];
  caveats: string[];
}

function insufficientData(
  options: { suiteId?: string },
  current: BenchmarkMatrixReport | undefined,
  eligible: BenchmarkMatrixReport[],
  caveats: string[],
): AgentEvaluationIntelligence {
  return {
    status: "insufficient-data",
    suiteId: options.suiteId ?? current?.suiteId ?? "",
    runsAnalyzed: eligible.length,
    generatedAt: new Date().toISOString(),
    cards: [],
    recommendations: [
      "Run benchmark-matrix at least once with per-agent score collection; repeat comparable runs to establish trends.",
    ],
    caveats,
  };
}

export function buildAgentEvaluationIntelligence(
  history: BenchmarkMatrixReport[],
  options: { suiteId?: string; candidateId?: string; limit?: number } = {},
): AgentEvaluationIntelligence {
  const limit = Math.max(2, Math.min(50, options.limit ?? 10));

  // Fix: use Date.parse for chronological sort instead of locale-string comparison.
  const eligible = history
    .filter(report => report.summary.length > 0 && (!options.suiteId || report.suiteId === options.suiteId))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(-limit);

  const current = eligible.at(-1);

  const caveats = [
    "Scores reflect the configured benchmark rubric; they are not a universal measure of agent quality.",
    "Comparisons are descriptive. Different suites, prompts, models or source snapshots can confound trends.",
    "Criterion failure counts are based only on recorded failedCriteria and completed benchmark trials.",
  ];

  if (!current?.agentSummary?.length) {
    return insufficientData(options, current, eligible, caveats);
  }

  const selected = current.agentSummary.filter(
    item => !options.candidateId || item.candidateId === options.candidateId,
  );

  // Fix: when a candidateId filter is provided but matches nothing, return
  // insufficient-data rather than a misleading "ready" with 0 cards.
  if (!selected.length) {
    return insufficientData(options, current, eligible, caveats);
  }

  const cards: AgentEffectivenessCard[] = selected.map(item => {
    // Collect the per-run agentSummary entries for this exact agent+candidate
    // combination across all reports that belong to the same matrix/suite/goal.
    const same = eligible
      .filter(
        report =>
          report.matrixId === current.matrixId &&
          report.suiteId === current.suiteId &&
          report.goal === current.goal,
      )
      .flatMap(report =>
        (report.agentSummary ?? []).filter(
          agent =>
            agent.candidateId === item.candidateId &&
            agent.agent === item.agent &&
            agent.provider === item.provider &&
            agent.model === item.model,
        ),
      );

    const previous = same.length > 1 ? same[same.length - 2]! : undefined;

    // Fix: normalize -0 to 0 to avoid "Trend: -0 points" in formatted output.
    let scoreTrend: number | null = previous
      ? Math.round((item.averageScore - previous.averageScore) * 10) / 10
      : null;
    if (Object.is(scoreTrend, -0)) scoreTrend = 0;

    // Collect individual agent-score entries from completed results only,
    // scoped to the same matrix/suite/goal and matching provider+model.
    const scores = eligible
      .filter(
        report =>
          report.matrixId === current.matrixId &&
          report.suiteId === current.suiteId &&
          report.goal === current.goal,
      )
      .flatMap(report =>
        report.results
          .filter(
            result =>
              result.candidateId === item.candidateId &&
              result.provider === item.provider &&
              result.model === item.model &&
              result.status === "completed",
          )
          .flatMap(result =>
            (result.agentScores ?? [])
              .filter(score => score.agent === item.agent)
              .map(score => ({ ...score, runId: result.runId })),
          ),
      );

    // Per-case aggregates, sorted ascending so weakest cases surface first.
    const caseIds = [...new Set(scores.map(score => score.caseId))].sort();
    const caseMetrics: AgentCaseMetric[] = caseIds
      .map(caseId => {
        const values = scores.filter(score => score.caseId === caseId);
        const totalScore = values.reduce((sum, v) => sum + v.score, 0);
        const passCount = values.filter(v => v.passed).length;
        return {
          caseId,
          evaluations: values.length,
          averageScore: Math.round((totalScore / values.length) * 10) / 10,
          passRate: Math.round((passCount / values.length) * 1000) / 10,
        };
      })
      .sort((a, b) => a.averageScore - b.averageScore);

    // Build criterion failure counts in a single pass, then derive evaluations
    // from scores.length instead of a redundant nested loop.
    const criteriaFailures = new Map<string, number>();
    for (const score of scores) {
      for (const failed of score.failedCriteria ?? []) {
        criteriaFailures.set(failed.id, (criteriaFailures.get(failed.id) ?? 0) + 1);
      }
    }
    const criterionSignals: AgentCriterionSignal[] = [...criteriaFailures.entries()]
      .map(([criterionId, failures]) => ({
        criterionId,
        failures,
        evaluations: scores.length,
        failureRate: scores.length
          ? Math.round((failures / scores.length) * 1000) / 10
          : 0,
      }))
      .sort((a, b) => b.failureRate - a.failureRate);

    // Strengths: cases that consistently score well across at least 2 evaluations.
    const strengths = caseMetrics
      .filter(c => c.averageScore >= 85 && c.evaluations >= 2)
      .map(c => c.caseId);

    // Improvement areas: weak cases (score < 75) and high-failure-rate criteria (>= 30 %).
    const improvementAreas = [
      ...caseMetrics.filter(c => c.averageScore < 75).map(c => "case:" + c.caseId),
      ...criterionSignals.filter(c => c.failureRate >= 30).map(c => "criterion:" + c.criterionId),
    ];

    // Confidence tiers reflect how much evidence backs the card.
    const confidence: AgentEffectivenessCard["confidence"] =
      scores.length >= 10 && eligible.length >= 3
        ? "high"
        : scores.length >= 4 && eligible.length >= 2
          ? "medium"
          : "low";

    return {
      candidateId: item.candidateId,
      provider: item.provider,
      model: item.model,
      agent: item.agent,
      evaluations: scores.length,
      averageScore: item.averageScore,
      passRate: item.passRate,
      scoreTrend,
      caseMetrics,
      criterionSignals,
      strengths,
      improvementAreas,
      confidence,
    };
  }).sort((a, b) => a.averageScore - b.averageScore || a.agent.localeCompare(b.agent));

  const recommendations = cards.flatMap(card => [
    ...(card.scoreTrend !== null && card.scoreTrend <= -5
      ? [`${card.agent}: investigate the recent ${Math.abs(card.scoreTrend)}-point score decline before changing prompts.`]
      : []),
    ...(card.improvementAreas.length
      ? [`${card.agent}: prioritize ${card.improvementAreas.slice(0, 4).join(", ")} with targeted evaluation cases.`]
      : []),
    ...(card.evaluations < 3
      ? [`${card.agent}: collect more trials; current evidence is limited.`]
      : []),
  ]);

  return {
    status: "ready",
    suiteId: current.suiteId,
    runsAnalyzed: eligible.length,
    generatedAt: new Date().toISOString(),
    cards,
    recommendations: recommendations.length
      ? recommendations
      : ["No repeated weak areas detected in the analyzed benchmark evidence."],
    caveats,
  };
}

export function formatAgentEvaluationIntelligence(report: AgentEvaluationIntelligence): string {
  const lines = [
    "ANVIL Agent Evaluation Intelligence",
    "Status: " + report.status.toUpperCase(),
    "Suite: " + (report.suiteId || "not available"),
    "Runs analyzed: " + report.runsAnalyzed,
    "",
  ];

  for (const card of report.cards) {
    const trendLabel =
      card.scoreTrend === null
        ? "not enough comparable history"
        : (card.scoreTrend > 0 ? "+" : "") + card.scoreTrend + " points";

    lines.push(
      `${card.agent} · ${card.candidateId} · ${card.provider}/${card.model}`,
      `  Effectiveness: ${card.averageScore}/100 · pass rate ${card.passRate}% · evaluations ${card.evaluations} · confidence ${card.confidence}`,
      `  Trend: ${trendLabel}`,
    );

    if (card.strengths.length) {
      lines.push("  Strengths: " + card.strengths.join(", "));
    }
    if (card.caseMetrics.length) {
      lines.push(
        "  Case scores: " +
          card.caseMetrics
            .map(item => `${item.caseId} ${item.averageScore}/100 (${item.passRate}% pass)`)
            .join(" · "),
      );
    }
    if (card.criterionSignals.length) {
      lines.push(
        "  Failure signals: " +
          card.criterionSignals
            .slice(0, 5)
            .map(item => `${item.criterionId} ${item.failureRate}% (${item.failures}/${item.evaluations})`)
            .join(" · "),
      );
    }
    if (card.improvementAreas.length) {
      lines.push("  Focus: " + card.improvementAreas.join(", "));
    }
  }

  lines.push(
    "",
    "Recommendations:",
    ...report.recommendations.map(item => "  - " + item),
    "",
    "Caveats:",
    ...report.caveats.map(item => "  - " + item),
  );

  return lines.join("\n");
}
