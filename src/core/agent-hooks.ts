// Agent "stop" hooks: when an AI coding agent says it is done, run the ANVIL
// gate on the files it changed. If the gate fails, tell the agent what to fix
// so it keeps working instead of stopping.
//
// Each tool has its own hook protocol:
//   Claude Code  stdin { stop_hook_active }, stdout { decision: "block", reason }
//   Cursor       stdin { status, loop_count }, stdout { followup_message }
//
// Loop guards make sure a gate that the agent cannot fix never traps it: Claude
// is asked to fix things once per stop, and Cursor at most MAX_CURSOR_LOOPS times.

import type { GateEvaluation, NormalizedFinding } from "./policy-engine.js";

export type HookHarness = "claude" | "cursor";
export const HOOK_HARNESSES: readonly HookHarness[] = ["claude", "cursor"];
export const MAX_CURSOR_LOOPS = 2;
const MAX_LISTED = 10;

export interface HookDecision {
  /** Run the gate at all? False when a loop guard or status says to let the agent stop. */
  runGate: boolean;
  skipReason?: string;
}

type JsonObject = Record<string, unknown>;

export function parseHookInput(raw: string): JsonObject {
  if (!raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as JsonObject) : {};
  } catch {
    return {};
  }
}

export function decideHook(harness: HookHarness, input: JsonObject): HookDecision {
  if (harness === "claude" && input.stop_hook_active === true) {
    return { runGate: false, skipReason: "already continued once after a gate failure" };
  }
  if (harness === "cursor") {
    if (typeof input.status === "string" && input.status !== "completed") {
      return { runGate: false, skipReason: `agent stopped with status "${input.status}"` };
    }
    if (typeof input.loop_count === "number" && input.loop_count >= MAX_CURSOR_LOOPS) {
      return { runGate: false, skipReason: `already sent ${input.loop_count} follow-ups` };
    }
  }
  return { runGate: true };
}

/** The project directory the agent is working in, from the hook input when the tool provides it. */
export function hookWorkspace(input: JsonObject, fallback: string): string {
  if (typeof input.cwd === "string" && input.cwd) return input.cwd;
  if (Array.isArray(input.workspace_roots) && typeof input.workspace_roots[0] === "string")
    return input.workspace_roots[0];
  return fallback;
}

function blocking(evaluation: GateEvaluation): NormalizedFinding[] {
  const rank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  return evaluation.activeFindings
    .filter((f) => f.severity !== "low" && f.confidence !== "low" && f.confidence !== "heuristic")
    .sort((a, b) => rank[a.severity] - rank[b.severity] || a.file.localeCompare(b.file) || a.line - b.line);
}

/** The message the agent reads when the gate fails. Plain, short, actionable. */
export function formatFeedback(evaluation: GateEvaluation): string {
  const findings = blocking(evaluation);
  const lines = ["ANVIL gate failed on the files you changed. Fix these before finishing:", ""];
  for (const violation of evaluation.violations) lines.push(`- ${violation}`);
  if (evaluation.violations.length) lines.push("");
  for (const f of findings.slice(0, MAX_LISTED)) {
    lines.push(`- [${f.severity}] ${f.file}:${f.line} ${f.id}: ${f.message}`);
  }
  if (findings.length > MAX_LISTED) lines.push(`- ...and ${findings.length - MAX_LISTED} more.`);
  lines.push(
    "",
    "Re-check with `anvil gate . --diff`. If a finding is a false positive, add",
    "`// anvil-disable-next-line RULE-ID -- reason` above the line instead of working around it."
  );
  return lines.join("\n");
}

/** What to print on stdout for this harness. Empty string means "let the agent stop". */
export function hookOutput(harness: HookHarness, evaluation: GateEvaluation | undefined): string {
  if (!evaluation || evaluation.passed) return harness === "cursor" ? "{}" : "";
  const message = formatFeedback(evaluation);
  if (harness === "claude") return JSON.stringify({ decision: "block", reason: message });
  return JSON.stringify({ followup_message: message });
}
