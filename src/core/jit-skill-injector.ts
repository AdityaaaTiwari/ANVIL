import { realpath } from "node:fs/promises";
import path from "node:path";
import { estimateTokens } from "./context-budget.js";
import { SYNONYMS, tokenize } from "./consult.js";
import { loadHarnessCatalog } from "./harness-catalog.js";
import { activeInstincts } from "./instincts.js";
import { loadSkillRegistry } from "./skill-registry.js";

export interface JitSkillMatch {
  id: string;
  name: string;
  source: "workspace" | "builtin" | "catalog" | "instinct";
  score: number;
  matchedTerms: string[];
  tokens: number;
  summary: string;
}

export interface JitSkillInjectionResult {
  prompt: string;
  maxTokens: number;
  totalTokens: number;
  withinBudget: boolean;
  candidateCount: number;
  selected: JitSkillMatch[];
  formattedContext: string;
  durationMs: number;
}

export interface JitSkillOptions {
  maxTokens?: number | undefined;
  maxSkills?: number | undefined;
  minScore?: number | undefined;
  includeCatalog?: boolean | undefined;
  includeInstincts?: boolean | undefined;
}

interface CandidateSkill {
  id: string;
  name: string;
  source: JitSkillMatch["source"];
  triggers: string[];
  tags: string[];
  description: string;
  body: string;
  priorityBonus: number;
}

const DEFAULT_MAX_TOKENS = 900;
const HARD_TOKEN_CEILING = 1_000;
const DEFAULT_MAX_SKILLS = 3;
const DEFAULT_MIN_SCORE = 4;

function clampBudget(maxTokens: number | undefined): number {
  const n = maxTokens ?? DEFAULT_MAX_TOKENS;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_TOKENS;
  return Math.max(120, Math.min(HARD_TOKEN_CEILING, Math.floor(n)));
}

function expandPromptTokens(prompt: string): {
  directTokens: Set<string>;
  stemmedDirect: Set<string>;
  synonyms: Set<string>;
} {
  const tokens = tokenize(prompt);
  const directTokens = new Set(tokens);
  const stemmedDirect = new Set<string>();
  const synonyms = new Set<string>();

  for (const token of tokens) {
    const stem = token.replace(/(?:ing|ers|er|es|s)$/, "");
    if (stem.length > 2) stemmedDirect.add(stem);
    for (const syn of SYNONYMS[token] ?? SYNONYMS[stem] ?? []) {
      if (!directTokens.has(syn)) synonyms.add(syn);
    }
  }
  return { directTokens, stemmedDirect, synonyms };
}

function normalizeTerms(list: string[]): Set<string> {
  const set = new Set<string>();
  for (const raw of list) {
    const clean = raw.trim().toLowerCase();
    if (!clean) continue;
    set.add(clean);
    for (const part of tokenize(clean)) {
      set.add(part);
      const stem = part.replace(/(?:ing|ers|er|es|s)$/, "");
      if (stem.length > 2) set.add(stem);
    }
  }
  return set;
}

function scoreCandidate(
  candidate: CandidateSkill,
  promptLower: string,
  expanded: ReturnType<typeof expandPromptTokens>
): { score: number; matchedTerms: string[]; directHitCount: number; exactSkillMatch: boolean } {
  let score = 0;
  const matched = new Set<string>();
  let directHits = 0;
  let exactSkillMatch = false;

  if (promptLower.includes(candidate.id.toLowerCase())) {
    score += 6;
    directHits++;
    exactSkillMatch = true;
    matched.add(candidate.id);
  }

  for (const trigger of candidate.triggers) {
    const t = trigger.trim().toLowerCase();
    if (t.length >= 4 && promptLower.includes(t)) {
      score += 4;
      directHits++;
      if ((t.includes("-") || t.includes(" ")) && t.length >= 6) {
        exactSkillMatch = true;
      }
      matched.add(t);
    }
  }

  const triggerAndTagTokens = normalizeTerms([candidate.id, ...candidate.triggers, ...candidate.tags]);
  const textTokens = normalizeTerms([candidate.name, candidate.description]);

  for (const tok of expanded.directTokens) {
    const stem = tok.replace(/(?:ing|ers|er|es|s)$/, "");
    const hasStem = stem.length > 2 && stem !== tok;
    if (triggerAndTagTokens.has(tok) || (hasStem && triggerAndTagTokens.has(stem))) {
      score += 3;
      directHits++;
      matched.add(tok);
    } else if (textTokens.has(tok) || (hasStem && textTokens.has(stem))) {
      score += 1.5;
      directHits++;
      matched.add(tok);
    }
  }

  if (directHits > 0) {
    let synHits = 0;
    for (const syn of expanded.synonyms) {
      if (triggerAndTagTokens.has(syn) || textTokens.has(syn)) {
        score += 1.5;
        matched.add(syn);
        synHits++;
        if (synHits >= 3) break;
      }
    }
    score += candidate.priorityBonus;
  }

  return { score, matchedTerms: [...matched].slice(0, 6), directHitCount: directHits, exactSkillMatch };
}

function stripHtmlCommentsAndCodeFences(input: string): string {
  let out = "";
  let i = 0;
  while (i < input.length) {
    if (input.startsWith("<!--", i)) {
      const end = input.indexOf("-->", i + 4);
      if (end === -1) break;
      i = end + 3;
    } else if (input.startsWith("```", i)) {
      const end = input.indexOf("```", i + 3);
      if (end === -1) break;
      i = end + 3;
    } else {
      out += input[i]!;
      i++;
    }
  }
  // Iterate to fixed point so crafted overlapping sequences cannot re-form HTML comment delimiters.
  while (out.includes("<!--") || out.includes("-->")) {
    out = out.split("<!--").join("").split("-->").join("");
  }
  return out;
}

/**
 * Compresses skill markdown into dense, actionable directives bounded by charCap.
 */
function compactDirective(body: string, charCap: number): string {
  const cleaned = stripHtmlCommentsAndCodeFences(body)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("# "))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length <= charCap) return cleaned;
  const slice = cleaned.slice(0, Math.max(40, charCap - 3));
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 40 ? slice.slice(0, lastSpace) : slice).trimEnd() + "...";
}

/**
 * Selects high-relevance skills & instincts for the current prompt under a strict
 * sub-1k token budget (`maxTokens <= 1000`, default 900) for `prompt-submit` injection.
 * 100% deterministic and offline — no LLM or network calls.
 */
export async function injectJitSkills(
  projectPath: string,
  prompt: string,
  options: JitSkillOptions = {}
): Promise<JitSkillInjectionResult> {
  const startedAt = Date.now();
  const maxTokens = clampBudget(options.maxTokens);
  const maxSkills = Math.max(1, Math.min(6, Math.floor(options.maxSkills ?? DEFAULT_MAX_SKILLS)));
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;
  const cleanPrompt = prompt.trim();

  const expanded = expandPromptTokens(cleanPrompt);
  if (!cleanPrompt || expanded.directTokens.size === 0) {
    return {
      prompt: cleanPrompt,
      maxTokens,
      totalTokens: 0,
      withinBudget: true,
      candidateCount: 0,
      selected: [],
      formattedContext: "",
      durationMs: Date.now() - startedAt,
    };
  }

  const root = await realpath(path.resolve(projectPath));
  const [registrySkills, catalogResult, instinctsResult] = await Promise.all([
    loadSkillRegistry(root).catch(() => []),
    options.includeCatalog === false ? Promise.resolve(null) : loadHarnessCatalog().catch(() => null),
    options.includeInstincts === false
      ? Promise.resolve([])
      : activeInstincts(root, { includeGlobal: false }).catch(() => []),
  ]);

  const byId = new Map<string, CandidateSkill>();

  for (const skill of registrySkills) {
    byId.set(skill.id, {
      id: skill.id,
      name: skill.name,
      source: skill.source === "workspace" ? "workspace" : "builtin",
      triggers: skill.triggers,
      tags: skill.tags ?? [],
      description: skill.description,
      body: skill.instructions,
      priorityBonus: skill.source === "workspace" ? 1 : 0,
    });
  }

  if (catalogResult) {
    for (const item of catalogResult.items) {
      if (item.kind !== "skill" || byId.has(item.id)) continue;
      byId.set(item.id, {
        id: item.id,
        name: item.name,
        source: "catalog",
        triggers: [item.id, ...item.tags],
        tags: item.tags,
        description: item.description,
        body: `${item.description}\n${item.body}`,
        priorityBonus: 0,
      });
    }
  }

  for (const instinct of instinctsResult) {
    const instId = `instinct-${instinct.id}`;
    if (byId.has(instId)) continue;
    byId.set(instId, {
      id: instId,
      name: `Project Habit (${instinct.trigger})`,
      source: "instinct",
      triggers: [instinct.trigger],
      tags: ["instinct", instinct.trigger],
      description: instinct.trigger,
      body: instinct.action,
      priorityBonus: instinct.confidence >= 0.7 ? 1 : 0,
    });
  }

  const promptLower = cleanPrompt.toLowerCase();
  const candidates = [...byId.values()];

  const ranked = candidates
    .map((candidate) => {
      const scored = scoreCandidate(candidate, promptLower, expanded);
      return { candidate, ...scored };
    })
    .filter(({ score, directHitCount, exactSkillMatch }) => {
      if (directHitCount === 0) return false;
      // Guard short 1-token generic prompts ("add tests") unless exact skill ID or multi-word trigger matches.
      if (expanded.directTokens.size < 2 && !exactSkillMatch) return false;
      return score >= minScore;
    })
    .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id));

  const header = `[ANVIL JIT Skills — task-scoped guidance (verify against current code)]`;
  const perSkillCharBudget = Math.max(220, Math.floor(((maxTokens - 40) * 4) / maxSkills));

  const selected: JitSkillMatch[] = [];
  const blocks: string[] = [header];

  for (const item of ranked) {
    if (selected.length >= maxSkills) break;
    const directive = compactDirective(item.candidate.body, perSkillCharBudget);
    if (!directive) continue;

    const line = `- **${item.candidate.name}** (\`${item.candidate.id}\`, ${item.candidate.source}): ${directive}`;
    const candidateText = [...blocks, line].join("\n");
    if (estimateTokens(candidateText) > maxTokens) {
      // Try shorter fit if remaining budget can still carry at least ~60 tokens.
      const remainingChars = maxTokens * 4 - blocks.join("\n").length - 80;
      if (remainingChars >= 160) {
        const compactShort = compactDirective(item.candidate.body, remainingChars);
        const trimmedLine = `- **${item.candidate.name}** (\`${item.candidate.id}\`, ${item.candidate.source}): ${compactShort}`;
        if (estimateTokens([...blocks, trimmedLine].join("\n")) <= maxTokens) {
          blocks.push(trimmedLine);
          selected.push({
            id: item.candidate.id,
            name: item.candidate.name,
            source: item.candidate.source,
            score: Math.round(item.score * 10) / 10,
            matchedTerms: item.matchedTerms,
            tokens: estimateTokens(trimmedLine),
            summary: compactShort,
          });
        }
      }
      break;
    }

    blocks.push(line);
    selected.push({
      id: item.candidate.id,
      name: item.candidate.name,
      source: item.candidate.source,
      score: Math.round(item.score * 10) / 10,
      matchedTerms: item.matchedTerms,
      tokens: estimateTokens(line),
      summary: directive,
    });
  }

  const formattedContext = selected.length > 0 ? blocks.join("\n") : "";
  const totalTokens = formattedContext ? estimateTokens(formattedContext) : 0;

  return {
    prompt: cleanPrompt,
    maxTokens,
    totalTokens,
    withinBudget: totalTokens <= maxTokens,
    candidateCount: candidates.length,
    selected,
    formattedContext,
    durationMs: Date.now() - startedAt,
  };
}
