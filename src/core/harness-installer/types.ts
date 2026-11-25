import { createHash } from "node:crypto";
import { lstat } from "node:fs/promises";
import path from "node:path";
import { HARNESS_CAPABILITIES } from "../harness-capabilities.js";
import { INSTALL_PROFILES, type HarnessCatalog, type InstallProfile } from "../harness-catalog.js";
import type { NativeHookHarness } from "../hook-adapters.js";
import { ANVIL_STATE_DIR } from "../workspace-paths.js";

/**
 * Shared types, constants, and target parsing helpers for the ANVIL harness installer.
 */

export type HarnessTarget =
  | "claude"
  | "cursor"
  | "codex"
  | "opencode"
  | "gemini"
  | "copilot"
  | "windsurf"
  | "kiro"
  | "cline"
  | "zed"
  | "claude-desktop"
  | "vscode"
  | "antigravity";

/** Installer targets are derived from the versioned capability manifest plus platform adapters. */
export const HARNESS_TARGETS: readonly HarnessTarget[] = [
  ...HARNESS_CAPABILITIES.map((item) => item.target),
  "vscode",
  "antigravity",
  "claude-desktop",
];

/** Targets installed when none are requested; harnesses detected in the project are added by the CLI. */
export const DEFAULT_TARGETS: readonly HarnessTarget[] = [
  "claude",
  "codex",
  "cursor",
  "vscode",
  "windsurf",
  "antigravity",
  "gemini",
  "opencode",
];

/** Project markers that show a harness is in use, so `anvil install` can include it automatically. */
const TARGET_MARKERS: Array<[HarnessTarget, string[]]> = [
  ["copilot", [".github/copilot-instructions.md", ".github/instructions", ".github/prompts"]],
  ["windsurf", [".windsurf", ".windsurfrules"]],
  ["kiro", [".kiro"]],
  ["cline", [".clinerules"]],
  ["zed", [".zed", ".rules"]],
];

/** Harnesses beyond the defaults that the project already uses. */
export async function detectHarnessTargets(projectPath: string): Promise<HarnessTarget[]> {
  const found: HarnessTarget[] = [];
  for (const [target, markers] of TARGET_MARKERS) {
    for (const marker of markers) {
      try {
        await lstat(path.join(projectPath, marker));
        found.push(target);
        break;
      } catch {
        /* not present */
      }
    }
  }
  return found;
}

export function normalizeHarnessTargets(targets: readonly string[]): HarnessTarget[] {
  const supported = new Set<string>(HARNESS_TARGETS);
  const aliases: Record<string, HarnessTarget> = {
    "claude-code": "claude",
    copilot: "vscode",
    "gemini-cli": "gemini",
    "google-antigravity": "antigravity",
  };
  const resolved = targets.map((t) => aliases[t] ?? (t as HarnessTarget));
  for (const target of resolved) {
    if (!supported.has(target)) {
      throw new Error(`Unknown target "${target}". Supported: ${HARNESS_TARGETS.join(", ")}, default, all.`);
    }
  }
  return [...new Set(resolved)];
}

export const STATE_SCHEMA = 2;
export const INSTALL_STATE_PATH = `${ANVIL_STATE_DIR}/install-state.json`;
export const TRANSACTION_JOURNAL_PATH = `${ANVIL_STATE_DIR}/transaction-journal.json`;
export const LEGACY_STATE_SCHEMA_VERSION = 1;
export const STATE_SCHEMA_VERSION = STATE_SCHEMA;

export const BLOCK_BEGIN = "<!-- anvil:begin (managed by `anvil install`; edit outside this block) -->";
export const BLOCK_END = "<!-- anvil:end -->";

export const CLAUDE_SETTINGS_PATH = ".claude/settings.json";
export const HOOK_TARGETS: readonly HarnessTarget[] = ["claude", "cursor"];
export const NPM_PACKAGE = "anvil-engineering-workbench";

export const HARNESS_LABELS: Record<HarnessTarget, string> = {
  claude: "Claude Code",
  "claude-desktop": "Claude Desktop",
  codex: "OpenAI Codex CLI / IDE",
  cursor: "Cursor",
  vscode: "VS Code (GitHub Copilot)",
  windsurf: "Windsurf",
  antigravity: "Google Antigravity",
  gemini: "Gemini CLI",
  opencode: "OpenCode",
  copilot: "GitHub Copilot",
  kiro: "Kiro",
  cline: "Cline",
  zed: "Zed",
};

export type ServerMode = "npx" | "global" | "local";

export interface PlannedMcpFile {
  target: HarnessTarget | "instructions";
  path: string;
  scope: "project" | "global";
  action: FileAction;
  content?: string;
  deleteFile?: boolean;
  note?: string;
}

export interface PlannedFile {
  path: string;
  content: string;
  targets: HarnessTarget[];
  item?: string;
}

export interface PlannedBlock {
  path: string;
  content: string;
  targets: HarnessTarget[];
}

export interface InstallPlan {
  profile: InstallProfile;
  targets: HarnessTarget[];
  languages: string[];
  files: PlannedFile[];
  blocks: PlannedBlock[];
  itemCount: number;
  /** Extra items requested with --with. */
  extras: string[];
}

export interface InstallStateFile {
  path: string;
  sha256: string;
  targets: HarnessTarget[];
  item?: string;
}

export interface InstallStateBlock {
  path: string;
  sha256: string;
  targets: HarnessTarget[];
  createdFile: boolean;
}

export interface InstallStateSettings {
  path: string;
  commands: string[];
  addedDeny: string[];
  createdFile: boolean;
}

/** ANVIL hook commands merged into another harness's native hook config (Cursor, Codex, Gemini). */
export interface InstallStateNativeHooks {
  target: NativeHookHarness;
  path: string;
  commands: string[];
  createdFile: boolean;
}

export interface InstallState {
  schemaVersion: number;
  anvilVersion?: string;
  installedAt: string;
  profile: InstallProfile;
  targets: HarnessTarget[];
  languages: string[];
  files: InstallStateFile[];
  blocks: InstallStateBlock[];
  /** Claude Code hook commands merged into .claude/settings.json by `--hooks`. */
  settings?: InstallStateSettings;
  /** Native hook configs for Cursor, Codex and Gemini CLI written by `--hooks`. */
  nativeHooks?: InstallStateNativeHooks[];
  /** Extra catalog items added with --with ("kind:id"). */
  extras?: string[];
}

export type FileAction =
  "create" | "update" | "unchanged" | "conflict" | "remove" | "keep-modified" | "overwrite" | "skip";

export interface InstallChange {
  path: string;
  action: FileAction;
  detail?: string;
}

export interface InstallResult {
  dryRun: boolean;
  plan: InstallPlan;
  changes: InstallChange[];
  conflicts: number;
  statePath: string;
}

export interface InstallOptions {
  projectPath: string;
  targets?: HarnessTarget[];
  profile?: InstallProfile;
  /** Rule languages. Undefined = auto-detect from project markers. */
  languages?: string[];
  dryRun?: boolean;
  force?: boolean;
  anvilVersion?: string;
  catalog?: HarnessCatalog;
  now?: () => Date;
  /** Merge ANVIL runtime hooks (guard, config guard, verify, session memory) into Claude Code settings. */
  hooks?: boolean;
  /** Also set ANVIL as the Claude Code status line (never replaces an existing one). Requires hooks. */
  statusLine?: boolean;
  /** Executable used in hook commands. Default "anvil". */
  hookCommand?: string;
  /** Extra catalog items installed regardless of profile or stack, as "kind:id" (e.g. "skill:django-patterns"). */
  extras?: string[];
  // ANVIL MCP install options:
  server?: ServerMode;
  localServerScript?: string;
  instructions?: boolean;
  rea?: boolean;
  homeDir?: string;
  platform?: NodeJS.Platform;
  appData?: string;
}

export function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function parseTargets(value: string | undefined): HarnessTarget[] {
  if (!value || value === "all" || value === "default") return [...DEFAULT_TARGETS];
  const targets = value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return normalizeHarnessTargets(targets);
}

export function parseProfile(value: string | undefined): InstallProfile {
  const profile = (value ?? "standard").toLowerCase();
  if (!INSTALL_PROFILES.includes(profile as InstallProfile)) {
    throw new Error(`Unknown profile "${profile}". Supported: ${INSTALL_PROFILES.join(", ")}.`);
  }
  return profile as InstallProfile;
}
