// Installs ANVIL into AI coding tools: registers the ANVIL MCP server in each
// tool's config file and adds an ANVIL section to the agent instruction files.
//
// Planning is pure (no I/O beyond reading existing files) so it can be shown
// with --dry-run and unit tested with a fake home directory and platform.

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const HARNESS_TARGETS = [
  "claude",
  "claude-desktop",
  "codex",
  "cursor",
  "vscode",
  "windsurf",
  "antigravity",
  "gemini",
  "opencode",
] as const;
export type HarnessTarget = (typeof HARNESS_TARGETS)[number];

/** Targets installed by `--target all`. Global-only desktop apps are opt-in. */
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
};

/** How the AI tool should launch the ANVIL MCP server. */
export type ServerMode = "npx" | "global" | "local";

export interface InstallOptions {
  projectPath: string;
  targets: readonly HarnessTarget[];
  server?: ServerMode;
  /** Absolute path to dist/mcp/server.js, used when server is "local". */
  localServerScript?: string;
  instructions?: boolean;
  /** Also install agent stop hooks (Claude Code, Cursor) that run `anvil gate --diff` when the agent finishes. */
  hooks?: boolean;
  /** Also register REA reverse-engineering MCP server (npx -y rea-agents serve) */
  rea?: boolean;
  homeDir?: string;
  platform?: NodeJS.Platform;
  /** Used for the Claude Desktop config location on Windows. */
  appData?: string;
}

/** Tools whose agents can be sent back to work by a stop hook. */
export const HOOK_TARGETS: readonly HarnessTarget[] = ["claude", "cursor"];
const HOOK_TIMEOUT_SECONDS = 180;

export type FileAction = "create" | "update" | "unchanged" | "skip" | "remove";

export interface PlannedFile {
  target: HarnessTarget | "instructions";
  path: string;
  scope: "project" | "global";
  action: FileAction;
  /** New file content; undefined when the file is left as it is. */
  content?: string;
  /** Uninstall left nothing else in the file, so it is deleted. */
  deleteFile?: boolean;
  note?: string;
}

export const NPM_PACKAGE = "anvil-engineering-workbench";
const SERVER_NAME = "anvil";
const MD_START = "<!-- anvil:start (managed by `anvil install`; edits inside are overwritten) -->";
const MD_END = "<!-- anvil:end -->";
const TOML_START = "# >>> anvil (managed by `anvil install`) >>>";
const TOML_END = "# <<< anvil <<<";

interface ServerLaunch {
  command: string;
  args: string[];
}

function launchFor(options: InstallOptions, target: HarnessTarget): ServerLaunch {
  const mode = options.server ?? "npx";
  let launch: ServerLaunch;
  if (mode === "local") {
    if (!options.localServerScript) throw new Error("--server local needs the path to dist/mcp/server.js.");
    launch = { command: "node", args: [options.localServerScript] };
  } else if (mode === "global") {
    launch = { command: "anvil", args: ["mcp", "start"] };
  } else {
    launch = { command: "npx", args: ["-y", NPM_PACKAGE, "mcp", "start"] };
  }
  // Claude Desktop on Windows cannot spawn npx/anvil (.cmd shims) directly.
  if (target === "claude-desktop" && (options.platform ?? process.platform) === "win32" && launch.command !== "node") {
    launch = { command: "cmd", args: ["/c", launch.command, ...launch.args] };
  }
  return launch;
}

/** Shell command a tool's stop hook runs. */
export function hookCommand(options: InstallOptions, harness: "claude" | "cursor"): string {
  const mode = options.server ?? "npx";
  const tail = `hook stop --harness ${harness}`;
  if (mode === "global") return `anvil ${tail}`;
  if (mode === "local") {
    if (!options.localServerScript) throw new Error("--server local needs the path to dist/mcp/server.js.");
    const cli = path.join(path.dirname(path.dirname(options.localServerScript)), "cli.js");
    return `node ${JSON.stringify(cli)} ${tail}`;
  }
  return `npx -y ${NPM_PACKAGE} ${tail}`;
}

const isAnvilHook = (command: unknown) =>
  typeof command === "string" && /\banvil/i.test(command) && /\bhook\s+stop\s+--harness\b/.test(command);

/** Adds (command) or removes (undefined) ANVIL's Stop hook in Claude Code settings, keeping all other hooks. */
function transformClaudeHooks(data: JsonObject, command: string | undefined): JsonObject {
  const hooks = isObject(data.hooks) ? { ...data.hooks } : {};
  const groups = Array.isArray(hooks.Stop) ? (hooks.Stop as unknown[]) : [];
  const kept = groups
    .map((group) => {
      if (!isObject(group) || !Array.isArray(group.hooks)) return group;
      return { ...group, hooks: group.hooks.filter((h) => !(isObject(h) && isAnvilHook(h.command))) };
    })
    .filter((group) => !(isObject(group) && Array.isArray(group.hooks) && group.hooks.length === 0));
  if (command) kept.push({ hooks: [{ type: "command", command, timeout: HOOK_TIMEOUT_SECONDS }] });
  const next: JsonObject = { ...data };
  if (kept.length) hooks.Stop = kept;
  else delete hooks.Stop;
  if (Object.keys(hooks).length) next.hooks = hooks;
  else delete next.hooks;
  return next;
}

/** Adds (command) or removes (undefined) ANVIL's stop hook in .cursor/hooks.json. */
function transformCursorHooks(data: JsonObject, command: string | undefined): JsonObject {
  const hooks = isObject(data.hooks) ? { ...data.hooks } : {};
  const stop = (Array.isArray(hooks.stop) ? (hooks.stop as unknown[]) : []).filter(
    (h) => !(isObject(h) && isAnvilHook(h.command))
  );
  if (command) stop.push({ command, timeout: HOOK_TIMEOUT_SECONDS });
  const next: JsonObject = { version: 1, ...data };
  if (stop.length) hooks.stop = stop;
  else delete hooks.stop;
  if (Object.keys(hooks).length) next.hooks = hooks;
  else delete next.hooks;
  return next;
}

const withHookNote = (plan: PlannedFile): PlannedFile =>
  plan.note || (plan.action !== "create" && plan.action !== "update")
    ? plan
    : { ...plan, note: "stop hook: runs `anvil gate --diff` when the agent finishes" };

async function planJsonTransform(
  target: HarnessTarget,
  file: string,
  transform: (data: JsonObject) => JsonObject,
  remove: boolean,
  emptyShape: JsonObject
): Promise<PlannedFile> {
  const scope = "project" as const;
  const existing = await readText(file);
  let data: JsonObject = {};
  if (existing !== undefined && existing.trim() !== "") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(existing);
    } catch {
      if (remove && !/hook\s+stop\s+--harness/.test(existing))
        return { target, path: file, scope, action: "unchanged" };
      return {
        target,
        path: file,
        scope,
        action: "skip",
        note: "Not plain JSON (comments?), left untouched; add or remove the ANVIL stop hook by hand.",
      };
    }
    if (!isObject(parsed))
      return { target, path: file, scope, action: "skip", note: "Top level is not a JSON object." };
    data = parsed;
  } else if (remove) {
    return { target, path: file, scope, action: "unchanged" };
  }
  const next = transform(data);
  if (existing !== undefined && JSON.stringify(next) === JSON.stringify(data))
    return { target, path: file, scope, action: "unchanged" };
  const content = JSON.stringify(next, null, 2) + "\n";
  const action: FileAction = existing === undefined ? "create" : remove ? "remove" : "update";
  if (remove && JSON.stringify(next) === JSON.stringify(emptyShape))
    return { target, path: file, scope, action, content, deleteFile: true };
  return { target, path: file, scope, action, content };
}

async function readText(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Sets `root[key][SERVER_NAME] = entry` in a JSON config file, keeping every
 * other setting. Files that are not plain JSON (e.g. with comments) are never
 * rewritten; the user gets the snippet to paste instead.
 */
async function planJsonEntries(
  target: HarnessTarget,
  file: string,
  scope: "project" | "global",
  key: string,
  entries: Record<string, JsonObject | undefined>,
  base: JsonObject = {}
): Promise<PlannedFile> {
  const existing = await readText(file);
  let data: JsonObject;
  const anyDefined = Object.values(entries).some((v) => v !== undefined);
  if (existing === undefined || existing.trim() === "") {
    if (!anyDefined) return { target, path: file, scope, action: "unchanged" };
    data = { ...base };
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(existing);
    } catch {
      if (!anyDefined && !Object.keys(entries).some((k) => existing.includes(`"${k}"`))) {
        return { target, path: file, scope, action: "unchanged" };
      }
      return {
        target,
        path: file,
        scope,
        action: "skip",
        note: anyDefined
          ? `Not plain JSON (comments?), left untouched. Add under "${key}".`
          : `Not plain JSON (comments?), left untouched. Remove entries from "${key}" by hand.`,
      };
    }
    if (!isObject(parsed))
      return { target, path: file, scope, action: "skip", note: "Top level is not a JSON object." };
    data = parsed;
  }
  const section = isObject(data[key]) ? { ...(data[key] as JsonObject) } : {};
  for (const [name, entry] of Object.entries(entries)) {
    if (entry) section[name] = entry;
    else delete section[name];
  }
  const next: JsonObject = { ...data, [key]: section };
  if (!anyDefined && Object.keys(section).length === 0) delete next[key];
  const content = JSON.stringify(next, null, 2) + "\n";
  if (existing !== undefined && content === existing) return { target, path: file, scope, action: "unchanged" };
  if (existing !== undefined && JSON.stringify(next) === JSON.stringify(JSON.parse(existing)))
    return { target, path: file, scope, action: "unchanged" };
  const action: FileAction = existing === undefined ? "create" : anyDefined ? "update" : "remove";
  const leftover = Object.keys(next).filter((k) => !(k in base) || next[k] !== base[k]);
  if (!anyDefined && leftover.length === 0) return { target, path: file, scope, action, content, deleteFile: true };
  return { target, path: file, scope, action, content };
}

function planJsonEntry(
  target: HarnessTarget,
  file: string,
  scope: "project" | "global",
  key: string,
  entry: JsonObject | undefined,
  base: JsonObject = {},
  serverName: string = SERVER_NAME
): Promise<PlannedFile> {
  return planJsonEntries(target, file, scope, key, { [serverName]: entry }, base);
}

/** Replaces (or appends, or removes) the managed block in a text file. */
function replaceBlock(existing: string, start: string, end: string, block: string | undefined): string {
  const from = existing.indexOf(start);
  const to = from >= 0 ? existing.indexOf(end, from) : -1;
  if (from >= 0 && to >= 0) {
    const before = existing.slice(0, from);
    const after = existing.slice(to + end.length);
    if (block === undefined) return (before.replace(/\n+$/, "\n") + after.replace(/^\n+/, "")).replace(/^\n+/, "");
    return before + block + after;
  }
  if (block === undefined) return existing;
  if (existing.trim() === "") return block + "\n";
  return existing.replace(/\n*$/, "\n\n") + block + "\n";
}

async function planBlock(
  target: PlannedFile["target"],
  file: string,
  scope: "project" | "global",
  start: string,
  end: string,
  body: string | undefined,
  conflict?: (text: string) => string | undefined
): Promise<PlannedFile> {
  const existing = await readText(file);
  if (existing === undefined && body === undefined) return { target, path: file, scope, action: "unchanged" };
  const current = existing ?? "";
  if (body !== undefined && !current.includes(start)) {
    const problem = conflict?.(current);
    if (problem) return { target, path: file, scope, action: "skip", note: problem };
  }
  const block = body === undefined ? undefined : `${start}\n${body}\n${end}`;
  const content = replaceBlock(current, start, end, block);
  if (content === current) return { target, path: file, scope, action: "unchanged" };
  const action: FileAction = existing === undefined ? "create" : body === undefined ? "remove" : "update";
  if (body === undefined && content.trim() === "")
    return { target, path: file, scope, action, content, deleteFile: true };
  return { target, path: file, scope, action, content };
}

const tomlString = (value: string) => JSON.stringify(value);

function codexToml(launch: ServerLaunch): string {
  return [
    `[mcp_servers.${SERVER_NAME}]`,
    `command = ${tomlString(launch.command)}`,
    `args = [${launch.args.map(tomlString).join(", ")}]`,
  ].join("\n");
}

export const AGENT_INSTRUCTIONS = `## ANVIL verification (installed by \`anvil install\`)

This project uses [ANVIL](https://github.com/anvil-workbench/ANVIL) to check AI-written changes locally.

- Before reading many files to understand the codebase, call the \`anvil_map_architecture\` and \`anvil_inspect_project\` MCP tools.
- Before finishing a change, call \`anvil_change_risk\` to see the blast radius and which tests to run.
- Before saying a task is done, run \`npx -y ${NPM_PACKAGE} gate .\` (or \`anvil gate .\`) and fix what it reports.
- Never commit secrets; \`anvil_security_audit\` checks for them.`;

function claudeDesktopConfig(home: string, platform: NodeJS.Platform, appData?: string): string {
  if (platform === "darwin")
    return path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  if (platform === "win32")
    return path.join(appData ?? path.join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  return path.join(home, ".config", "Claude", "claude_desktop_config.json");
}

/**
 * Works out every file change for the requested targets. Pass `remove: true`
 * to plan an uninstall instead.
 */
export async function planHarnessInstall(options: InstallOptions, remove = false): Promise<PlannedFile[]> {
  const project = path.resolve(options.projectPath);
  const home = options.homeDir ?? os.homedir();
  const platform = options.platform ?? process.platform;
  const plans: PlannedFile[] = [];
  const env = { ANVIL_WORKSPACE: project };
  const reaLaunch = { command: "npx", args: ["-y", "rea-agents", "serve"] };
  const reaPick = remove ? undefined : reaLaunch;
  const serversWithRea = (anvilEntry: JsonObject | undefined) => ({
    [SERVER_NAME]: anvilEntry,
    ...(options.rea ? { rea: reaPick } : {}),
  });

  for (const target of options.targets) {
    const launch = launchFor(options, target);
    const stdio = { command: launch.command, args: launch.args };
    const pick = (entry: JsonObject) => (remove ? undefined : entry);
    switch (target) {
      case "claude":
        // Claude Code starts project servers in the project root.
        plans.push(
          await planJsonEntries(
            target,
            path.join(project, ".mcp.json"),
            "project",
            "mcpServers",
            serversWithRea(pick(stdio))
          )
        );
        break;
      case "cursor":
        plans.push(
          await planJsonEntries(
            target,
            path.join(project, ".cursor", "mcp.json"),
            "project",
            "mcpServers",
            serversWithRea(pick({ ...stdio, env: { ANVIL_WORKSPACE: "${workspaceFolder}" } }))
          )
        );
        break;
      case "vscode":
        plans.push(
          await planJsonEntries(target, path.join(project, ".vscode", "mcp.json"), "project", "servers", {
            [SERVER_NAME]: pick({ type: "stdio", ...stdio, env: { ANVIL_WORKSPACE: "${workspaceFolder}" } }),
            ...(options.rea ? { rea: remove ? undefined : { type: "stdio", ...reaLaunch } } : {}),
          })
        );
        break;
      case "antigravity":
        plans.push(
          await planJsonEntries(
            target,
            path.join(project, ".agents", "mcp_config.json"),
            "project",
            "mcpServers",
            serversWithRea(pick({ ...stdio, env }))
          )
        );
        break;
      case "gemini":
        plans.push(
          await planJsonEntry(
            target,
            path.join(project, ".gemini", "settings.json"),
            "project",
            "mcpServers",
            pick(stdio)
          )
        );
        break;
      case "opencode":
        plans.push(
          await planJsonEntry(
            target,
            path.join(project, "opencode.json"),
            "project",
            "mcp",
            pick({ type: "local", command: [launch.command, ...launch.args], enabled: true }),
            { $schema: "https://opencode.ai/config.json" }
          )
        );
        break;
      case "windsurf":
        plans.push(
          await planJsonEntry(
            target,
            path.join(home, ".codeium", "windsurf", "mcp_config.json"),
            "global",
            "mcpServers",
            pick({ ...stdio, env })
          )
        );
        break;
      case "claude-desktop":
        plans.push(
          await planJsonEntry(
            target,
            claudeDesktopConfig(home, platform, options.appData),
            "global",
            "mcpServers",
            pick({ ...stdio, env })
          )
        );
        break;
      case "codex":
        // Codex starts MCP servers in the directory it was launched from.
        plans.push(
          await planBlock(
            target,
            path.join(home, ".codex", "config.toml"),
            "global",
            TOML_START,
            TOML_END,
            remove ? undefined : codexToml(launch),
            (text) =>
              /^\s*\[mcp_servers\.anvil\]/m.test(text)
                ? "Already has an [mcp_servers.anvil] section that `anvil install` did not write; left untouched."
                : undefined
          )
        );
        break;
    }
  }

  // Uninstall always removes ANVIL's hooks, whether or not --hooks is passed.
  if (options.hooks || remove) {
    for (const target of options.targets) {
      if (target === "claude") {
        const command = remove ? undefined : hookCommand(options, "claude");
        const plan = await planJsonTransform(
          target,
          path.join(project, ".claude", "settings.json"),
          (data) => transformClaudeHooks(data, command),
          remove,
          {}
        );
        plans.push(withHookNote(plan));
      } else if (target === "cursor") {
        const command = remove ? undefined : hookCommand(options, "cursor");
        const plan = await planJsonTransform(
          target,
          path.join(project, ".cursor", "hooks.json"),
          (data) => transformCursorHooks(data, command),
          remove,
          { version: 1 }
        );
        plans.push(withHookNote(plan));
      }
    }
  }

  if (options.instructions !== false) {
    const body = remove ? undefined : AGENT_INSTRUCTIONS;
    // AGENTS.md is read by Codex, Cursor, Copilot, OpenCode, Antigravity and Windsurf.
    plans.push(await planBlock("instructions", path.join(project, "AGENTS.md"), "project", MD_START, MD_END, body));
    if (options.targets.includes("claude"))
      plans.push(await planBlock("instructions", path.join(project, "CLAUDE.md"), "project", MD_START, MD_END, body));
    if (options.targets.includes("gemini"))
      plans.push(await planBlock("instructions", path.join(project, "GEMINI.md"), "project", MD_START, MD_END, body));
  }
  return plans;
}

/** Writes every planned change. Returns the plans that were written. */
export async function applyHarnessPlan(plans: readonly PlannedFile[]): Promise<PlannedFile[]> {
  const written: PlannedFile[] = [];
  for (const plan of plans) {
    if (plan.content === undefined) continue;
    if (plan.deleteFile) {
      await rm(plan.path, { force: true });
      written.push(plan);
      continue;
    }
    await mkdir(path.dirname(plan.path), { recursive: true });
    await writeFile(plan.path, plan.content, "utf8");
    written.push(plan);
  }
  return written;
}

export function parseTargets(value: string | undefined): HarnessTarget[] {
  if (!value || value === "all") return [...DEFAULT_TARGETS];
  const names = value
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  const aliases: Record<string, HarnessTarget> = {
    "claude-code": "claude",
    copilot: "vscode",
    "gemini-cli": "gemini",
    "google-antigravity": "antigravity",
  };
  const out: HarnessTarget[] = [];
  for (const name of names) {
    const target = aliases[name] ?? name;
    if (!(HARNESS_TARGETS as readonly string[]).includes(target))
      throw new Error(`Unknown target "${name}". Choose from: all, ${HARNESS_TARGETS.join(", ")}.`);
    if (!out.includes(target as HarnessTarget)) out.push(target as HarnessTarget);
  }
  return out;
}

export function formatHarnessPlan(
  plans: readonly PlannedFile[],
  project: string,
  home: string,
  dryRun: boolean
): string {
  const shown = (file: string) =>
    file.startsWith(project + path.sep)
      ? path.relative(project, file)
      : file.startsWith(home + path.sep)
        ? "~" + path.sep + path.relative(home, file)
        : file;
  const verb: Record<FileAction, string> = {
    create: dryRun ? "would create" : "created",
    update: dryRun ? "would update" : "updated",
    remove: dryRun ? "would remove" : "removed",
    unchanged: "unchanged",
    skip: "SKIPPED",
  };
  const lines = plans.map((plan) => {
    const label = plan.target === "instructions" ? "Agent instructions" : HARNESS_LABELS[plan.target];
    const line = `  ${verb[plan.action].padEnd(13)} ${label.padEnd(26)} ${shown(plan.path)}`;
    return plan.note ? `${line}\n${" ".repeat(16)}${plan.note}` : line;
  });
  return lines.join("\n");
}
