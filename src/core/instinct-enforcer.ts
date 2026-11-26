import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { COMMAND_RULES, HARNESS_HOOK_CONFIG_PATH } from "./harness-hooks.js";
import { activeInstincts, type Instinct, type InstinctSource } from "./instincts.js";

/**
 * Compiles approved project/global instincts into deterministic blocking Guard
 * and Stop-hook rules in `.anvil/harness-hooks.json`.
 *
 * Unlike passive prompt notes, enforced instincts take effect across every
 * supported harness (`PreToolUse` and `Stop`) while preserving user-authored rules.
 */

export const INSTINCT_RULE_PREFIX = "INST-";
const SAFE_SCRIPT = /^[a-zA-Z0-9:_-]{1,64}$/;
const SAFE_PATH = /^[A-Za-z0-9._/@*-]{1,200}$/;
const NEGATIVE_INTENT = /\b(?:never|don'?t|do\s+not|forbid|block|deny|prohibit|avoid|stop)\b/i;

export interface SerializedCommandRule {
  id: string;
  decision: "deny" | "ask";
  pattern: string;
  ignoreCase?: boolean;
  reason: string;
}

export interface SerializedCoChangeRule {
  id: string;
  whenEdited: string;
  requireEdited: string;
  reason: string;
}

export type CompiledRule =
  | { kind: "command-rule"; instinctId: string; origin: InstinctSource; rule: SerializedCommandRule }
  | { kind: "verify-script"; instinctId: string; origin: InstinctSource; script: string; area: string }
  | { kind: "cochange-rule"; instinctId: string; origin: InstinctSource; rule: SerializedCoChangeRule };

export interface CompileResult {
  compiled: CompiledRule[];
  skippedAdvisory: Array<{ id: string; trigger: string; reason: string }>;
}

export interface EnforceResult extends CompileResult {
  configPath: string;
  activeCount: number;
  changed: boolean;
  written: boolean;
  addedRuleIds: string[];
  updatedRuleIds: string[];
  removedRuleIds: string[];
  scriptsAdded: string[];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function suffixId(instinctId: string): string {
  return instinctId
    .replace(/^inst-/i, "")
    .toUpperCase()
    .slice(0, 16);
}

function ruleIdForCommand(instinct: Instinct, tag: string): string {
  const clean = tag.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  return `${INSTINCT_RULE_PREFIX}${clean}`.slice(0, 41);
}

function compileGuardInstinct(instinct: Instinct): CompiledRule | undefined {
  const match = /ANVIL Guard (GUARD-[A-Z0-9-]{2,34})/.exec(instinct.trigger);
  const guardId = match?.[1];
  if (!guardId) return undefined;
  const builtin = COMMAND_RULES.find((rule) => rule.id === guardId);
  if (!builtin) return undefined;
  return {
    kind: "command-rule",
    instinctId: instinct.id,
    origin: instinct.source,
    rule: {
      id: ruleIdForCommand(instinct, guardId),
      decision: "deny",
      pattern: builtin.pattern.source,
      ...(builtin.pattern.ignoreCase ? { ignoreCase: true } : {}),
      reason: `Enforced from approved instinct ${instinct.id}: ${builtin.reason}`.slice(0, 300),
    },
  };
}

function compileVerificationInstinct(instinct: Instinct): CompiledRule | undefined {
  const scriptMatch = /`npm run ([a-zA-Z0-9:_-]{1,64})`/.exec(instinct.action);
  const script = scriptMatch?.[1];
  if (!script || !SAFE_SCRIPT.test(script)) return undefined;
  const area = instinct.trigger.replace(/^editing\s+/i, "").trim() || "**";
  return {
    kind: "verify-script",
    instinctId: instinct.id,
    origin: instinct.source,
    script,
    area,
  };
}

function isSafeRelativeTarget(value: string): boolean {
  return SAFE_PATH.test(value) && !path.isAbsolute(value) && !value.includes("..") && !value.startsWith("/");
}

function compileCoChangeInstinct(instinct: Instinct): CompiledRule | undefined {
  const fromMatch = /^editing\s+(\S+)$/i.exec(instinct.trigger.trim());
  const toMatch = /^also review\s+(\S+)\b/i.exec(instinct.action.trim());
  const whenEdited = fromMatch?.[1]?.replace(/[`'",.;:]+$/g, "");
  const requireEdited = toMatch?.[1]?.replace(/[`'",.;:]+$/g, "");
  if (!whenEdited || !requireEdited || !isSafeRelativeTarget(whenEdited) || !isSafeRelativeTarget(requireEdited))
    return undefined;
  return {
    kind: "cochange-rule",
    instinctId: instinct.id,
    origin: instinct.source,
    rule: {
      id: ruleIdForCommand(instinct, `CO-${suffixId(instinct.id)}`),
      whenEdited,
      requireEdited,
      reason:
        `Enforced co-change coupling (${instinct.id}): check ${requireEdited} whenever ${whenEdited} changes`.slice(
          0,
          300
        ),
    },
  };
}

function compileConventionInstinct(instinct: Instinct, strict: boolean): CompiledRule | undefined {
  if (!/conventional commits/i.test(instinct.action)) return undefined;
  const pattern =
    String.raw`\bgit\s+commit\b[^;&|]*?\s-(?:[a-zA-Z]*m)\s+` +
    String.raw`(?:"(?!(?:feat|fix|docs|chore|refactor|test|perf|ci|build|style|revert|release)(?:\([^)]+\))?!?: )[^"]*"|` +
    String.raw`'(?!(?:feat|fix|docs|chore|refactor|test|perf|ci|build|style|revert|release)(?:\([^)]+\))?!?: )[^']*')`;
  if (pattern.length > 300) return undefined;
  return {
    kind: "command-rule",
    instinctId: instinct.id,
    origin: instinct.source,
    rule: {
      id: `${INSTINCT_RULE_PREFIX}CONVENTION`,
      decision: strict ? "deny" : "ask",
      pattern,
      reason: `Enforced from ${instinct.id}: commit messages must follow Conventional Commits (e.g. feat(api): ...).`,
    },
  };
}

function compileManualCommandInstinct(instinct: Instinct): CompiledRule | undefined {
  if (!NEGATIVE_INTENT.test(`${instinct.trigger} ${instinct.action}`)) return undefined;
  const cmdMatch = /`([^`\r\n]{2,100})`/.exec(instinct.trigger) ?? /`([^`\r\n]{2,100})`/.exec(instinct.action);
  const literal = cmdMatch?.[1]?.trim();
  if (!literal || /\s{2,}/.test(literal.slice(0, 2))) return undefined;
  const tokens = literal.split(/\s+/).filter(Boolean);
  if (!tokens.length) return undefined;
  const prefix = /^\w/.test(literal) ? "\\b" : "(?:^|\\s)";
  const suffix = /\w$/.test(literal) ? "\\b" : "(?=\\s|$|[;&|])";
  const pattern = `${prefix}${tokens.map(escapeRegex).join("\\s+")}${suffix}`;
  if (pattern.length > 280) return undefined;
  try {
    new RegExp(pattern, "i");
  } catch {
    return undefined;
  }
  return {
    kind: "command-rule",
    instinctId: instinct.id,
    origin: instinct.source,
    rule: {
      id: ruleIdForCommand(instinct, `CMD-${suffixId(instinct.id)}`),
      decision: "deny",
      pattern,
      ignoreCase: true,
      reason: `Blocked by enforced instinct ${instinct.id}: ${instinct.action}`.slice(0, 300),
    },
  };
}

export function compileInstincts(instincts: readonly Instinct[], options: { strict?: boolean } = {}): CompileResult {
  const strict = options.strict === true;
  const compiled: CompiledRule[] = [];
  const skippedAdvisory: CompileResult["skippedAdvisory"] = [];
  const seenIds = new Set<string>();

  for (const instinct of instincts) {
    if (instinct.status !== "active") continue;
    let entry: CompiledRule | undefined;
    switch (instinct.source) {
      case "guard":
        entry = compileGuardInstinct(instinct);
        break;
      case "verification":
        entry = compileVerificationInstinct(instinct);
        break;
      case "git-cochange":
        entry = compileCoChangeInstinct(instinct);
        break;
      case "git-convention":
        entry = compileConventionInstinct(instinct, strict);
        break;
      case "manual":
      case "import":
        entry =
          compileManualCommandInstinct(instinct) ??
          compileCoChangeInstinct(instinct) ??
          compileVerificationInstinct(instinct);
        break;
    }
    if (!entry) {
      skippedAdvisory.push({
        id: instinct.id,
        trigger: instinct.trigger,
        reason: "Advisory note (no deterministic command, verify-script, or co-change path extracted).",
      });
      continue;
    }
    if (entry.kind === "command-rule" || entry.kind === "cochange-rule") {
      if (seenIds.has(entry.rule.id)) continue;
      seenIds.add(entry.rule.id);
    }
    compiled.push(entry);
  }
  return { compiled, skippedAdvisory };
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

async function writeAtomicJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  try {
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

export async function enforceInstincts(
  projectPath: string,
  options: {
    write?: boolean;
    includeGlobal?: boolean;
    ids?: readonly string[];
    strict?: boolean;
    now?: () => Date;
  } = {}
): Promise<EnforceResult> {
  const root = path.resolve(projectPath);
  const configPath = path.join(root, HARNESS_HOOK_CONFIG_PATH);
  const allActive = await activeInstincts(root, { includeGlobal: options.includeGlobal ?? false });
  const filterSet = options.ids?.length ? new Set(options.ids) : undefined;
  const selected = filterSet ? allActive.filter((item) => filterSet.has(item.id)) : allActive;

  const { compiled, skippedAdvisory } = compileInstincts(selected, { strict: options.strict ?? false });

  let existingRawText: string | undefined;
  let existingDoc: Record<string, unknown> = {};
  try {
    existingRawText = await readFile(configPath, "utf8");
    const parsed: unknown = JSON.parse(existingRawText);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${HARNESS_HOOK_CONFIG_PATH} must contain a JSON object.`);
    }
    existingDoc = asObject(parsed);
  } catch (error) {
    if ((error as { code?: string })?.code !== "ENOENT") throw error;
  }

  const guard = asObject(existingDoc.guard);
  const existingCmdRules = Array.isArray(guard.rules) ? guard.rules : [];
  const verifyOnStop = asObject(existingDoc.verifyOnStop);
  const existingScripts = Array.isArray(verifyOnStop.scripts)
    ? verifyOnStop.scripts.filter((s): s is string => typeof s === "string")
    : [];
  const existingCoChange = Array.isArray(verifyOnStop.coChangeRules) ? verifyOnStop.coChangeRules : [];

  const compiledCmdRules = compiled
    .filter((item): item is Extract<CompiledRule, { kind: "command-rule" }> => item.kind === "command-rule")
    .map((item) => item.rule);
  const compiledCoChange = compiled
    .filter((item): item is Extract<CompiledRule, { kind: "cochange-rule" }> => item.kind === "cochange-rule")
    .map((item) => item.rule);
  const compiledScripts = [
    ...new Set(
      compiled
        .filter((item): item is Extract<CompiledRule, { kind: "verify-script" }> => item.kind === "verify-script")
        .map((item) => item.script)
    ),
  ];

  const userCmdRules = existingCmdRules.filter((r) => {
    const id = (r as { id?: unknown })?.id;
    return typeof id !== "string" || !id.startsWith(INSTINCT_RULE_PREFIX);
  });
  const userCoChange = existingCoChange.filter((r) => {
    const id = (r as { id?: unknown })?.id;
    return typeof id !== "string" || !id.startsWith(INSTINCT_RULE_PREFIX);
  });

  const previousInstCmd = new Map<string, string>();
  for (const r of existingCmdRules) {
    const id = (r as { id?: unknown })?.id;
    if (typeof id === "string" && id.startsWith(INSTINCT_RULE_PREFIX)) previousInstCmd.set(id, JSON.stringify(r));
  }
  const previousInstCo = new Map<string, string>();
  for (const r of existingCoChange) {
    const id = (r as { id?: unknown })?.id;
    if (typeof id === "string" && id.startsWith(INSTINCT_RULE_PREFIX)) previousInstCo.set(id, JSON.stringify(r));
  }

  // If filtering by explicit IDs, merge/preserve previously enforced INST-* rules not in this batch.
  const mergedCmdRules: unknown[] = [...userCmdRules];
  if (filterSet) {
    const newIds = new Set(compiledCmdRules.map((r) => r.id));
    for (const r of existingCmdRules) {
      const id = (r as { id?: unknown })?.id;
      if (typeof id === "string" && id.startsWith(INSTINCT_RULE_PREFIX) && !newIds.has(id)) mergedCmdRules.push(r);
    }
  }
  mergedCmdRules.push(...compiledCmdRules);

  const mergedCoChange: unknown[] = [...userCoChange];
  if (filterSet) {
    const newIds = new Set(compiledCoChange.map((r) => r.id));
    for (const r of existingCoChange) {
      const id = (r as { id?: unknown })?.id;
      if (typeof id === "string" && id.startsWith(INSTINCT_RULE_PREFIX) && !newIds.has(id)) mergedCoChange.push(r);
    }
  }
  mergedCoChange.push(...compiledCoChange);

  const scriptsAdded = compiledScripts.filter((s) => !existingScripts.includes(s));
  const mergedScripts = [...existingScripts, ...scriptsAdded].slice(0, 5);

  const addedRuleIds: string[] = [];
  const updatedRuleIds: string[] = [];
  const removedRuleIds: string[] = [];

  for (const r of compiledCmdRules) {
    const prev = previousInstCmd.get(r.id);
    if (!prev) addedRuleIds.push(r.id);
    else if (prev !== JSON.stringify(r)) updatedRuleIds.push(r.id);
  }
  for (const r of compiledCoChange) {
    const prev = previousInstCo.get(r.id);
    if (!prev) addedRuleIds.push(r.id);
    else if (prev !== JSON.stringify(r)) updatedRuleIds.push(r.id);
  }
  if (!filterSet) {
    const nextCmdIds = new Set(compiledCmdRules.map((r) => r.id));
    const nextCoIds = new Set(compiledCoChange.map((r) => r.id));
    for (const id of previousInstCmd.keys()) if (!nextCmdIds.has(id)) removedRuleIds.push(id);
    for (const id of previousInstCo.keys()) if (!nextCoIds.has(id)) removedRuleIds.push(id);
  }

  const nextDoc: Record<string, unknown> = {
    ...existingDoc,
    guard: {
      ...(guard.enabled !== undefined ? { enabled: guard.enabled } : { enabled: true }),
      ...guard,
      rules: mergedCmdRules.slice(0, 50),
    },
    verifyOnStop: {
      ...verifyOnStop,
      scripts: mergedScripts,
      ...(mergedCoChange.length ? { coChangeRules: mergedCoChange.slice(0, 50) } : {}),
    },
  };
  if (!mergedCoChange.length && "coChangeRules" in (nextDoc.verifyOnStop as Record<string, unknown>)) {
    delete (nextDoc.verifyOnStop as Record<string, unknown>).coChangeRules;
  }

  const nextText = JSON.stringify(nextDoc, null, 2) + "\n";
  const changed = existingRawText !== nextText;
  let written = false;
  if (options.write && changed) {
    await writeAtomicJson(configPath, nextDoc);
    written = true;
  }

  return {
    configPath: HARNESS_HOOK_CONFIG_PATH,
    activeCount: selected.length,
    compiled,
    skippedAdvisory,
    changed,
    written,
    addedRuleIds,
    updatedRuleIds,
    removedRuleIds,
    scriptsAdded,
  };
}

export function formatEnforceResult(result: EnforceResult): string {
  const lines = [
    `ANVIL instinct enforce (${result.written ? "written" : result.changed ? "dry-run" : "up to date"}):`,
    `  Active instincts scanned: ${result.activeCount}`,
    `  Compiled rules: ${result.compiled.length} (${result.addedRuleIds.length} new, ${result.updatedRuleIds.length} updated, ${result.removedRuleIds.length} removed, ${result.scriptsAdded.length} verify script(s))`,
    `  Config target: ${result.configPath}`,
  ];
  for (const item of result.compiled) {
    if (item.kind === "command-rule")
      lines.push(`  + [PreToolUse ${item.rule.decision}] ${item.rule.id}: ${item.rule.reason}`);
    else if (item.kind === "cochange-rule")
      lines.push(
        `  + [Stop co-change] ${item.rule.id}: ${item.rule.whenEdited} -> requires ${item.rule.requireEdited}`
      );
    else lines.push(`  + [Stop verify] npm run ${item.script} (area ${item.area})`);
  }
  if (result.skippedAdvisory.length) {
    lines.push(`  Advisory-only (remained in SessionStart context): ${result.skippedAdvisory.length}`);
  }
  if (result.changed && !result.written) {
    lines.push("Dry run — re-run with --write to persist rules into .anvil/harness-hooks.json.");
  }
  return lines.join("\n");
}
