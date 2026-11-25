import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_TARGETS,
  HARNESS_LABELS,
  NPM_PACKAGE,
  type FileAction,
  type HarnessTarget,
  type InstallOptions,
  type PlannedMcpFile,
} from "./types.js";

const HOOK_TIMEOUT_SECONDS = 180;
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
  if (target === "claude-desktop" && (options.platform ?? process.platform) === "win32" && launch.command !== "node") {
    launch = { command: "cmd", args: ["/c", launch.command, ...launch.args] };
  }
  return launch;
}

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
  typeof command === "string" && /\banvil\b/i.test(command) && /\bhook\s+stop\s+--harness\b/.test(command);

function transformClaudeHooks(data: Record<string, unknown>, command: string | undefined): Record<string, unknown> {
  const hooks =
    data.hooks && typeof data.hooks === "object" && !Array.isArray(data.hooks)
      ? { ...(data.hooks as Record<string, unknown>) }
      : {};
  const groups = Array.isArray(hooks.Stop) ? (hooks.Stop as unknown[]) : [];
  const kept = groups
    .map((group) => {
      if (!group || typeof group !== "object" || !Array.isArray((group as Record<string, unknown>).hooks)) return group;
      const filtered = ((group as Record<string, unknown>).hooks as unknown[]).filter(
        (h) => !(h && typeof h === "object" && isAnvilHook((h as Record<string, unknown>).command))
      );
      return { ...(group as Record<string, unknown>), hooks: filtered };
    })
    .filter(
      (group) =>
        !(
          group &&
          typeof group === "object" &&
          Array.isArray((group as Record<string, unknown>).hooks) &&
          ((group as Record<string, unknown>).hooks as unknown[]).length === 0
        )
    );
  if (command) kept.push({ hooks: [{ type: "command", command, timeout: HOOK_TIMEOUT_SECONDS }] });
  const next: Record<string, unknown> = { ...data };
  if (kept.length) hooks.Stop = kept;
  else delete hooks.Stop;
  if (Object.keys(hooks).length) next.hooks = hooks;
  else delete next.hooks;
  return next;
}

function transformCursorHooks(data: Record<string, unknown>, command: string | undefined): Record<string, unknown> {
  const hooks =
    data.hooks && typeof data.hooks === "object" && !Array.isArray(data.hooks)
      ? { ...(data.hooks as Record<string, unknown>) }
      : {};
  const stop = (Array.isArray(hooks.stop) ? (hooks.stop as unknown[]) : []).filter(
    (h) => !(h && typeof h === "object" && isAnvilHook((h as Record<string, unknown>).command))
  );
  if (command) stop.push({ command, timeout: HOOK_TIMEOUT_SECONDS });
  const next: Record<string, unknown> = { version: 1, ...data };
  if (stop.length) hooks.stop = stop;
  else delete hooks.stop;
  if (Object.keys(hooks).length) next.hooks = hooks;
  else delete next.hooks;
  return next;
}

const withHookNote = (plan: PlannedMcpFile): PlannedMcpFile =>
  plan.note || (plan.action !== "create" && plan.action !== "update")
    ? plan
    : { ...plan, note: "stop hook: runs `anvil gate --diff` when the agent finishes" };

async function readText(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function planJsonTransform(
  target: HarnessTarget,
  file: string,
  transform: (data: Record<string, unknown>) => Record<string, unknown>,
  remove: boolean,
  emptyShape: Record<string, unknown>
): Promise<PlannedMcpFile> {
  const scope = "project" as const;
  const existing = await readText(file);
  let data: Record<string, unknown> = {};
  if (existing !== undefined && existing.trim() !== "") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(existing);
    } catch {
      if (remove && !/hook\s+stop\s+--harness/.test(existing)) {
        return { target, path: file, scope, action: "unchanged" };
      }
      return {
        target,
        path: file,
        scope,
        action: "skip",
        note: "Not plain JSON (comments?), left untouched; add or remove the ANVIL stop hook by hand.",
      };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { target, path: file, scope, action: "skip", note: "Top level is not a JSON object." };
    }
    data = parsed as Record<string, unknown>;
  } else if (remove) {
    return { target, path: file, scope, action: "unchanged" };
  }
  const next = transform(data);
  if (existing !== undefined && JSON.stringify(next) === JSON.stringify(data)) {
    return { target, path: file, scope, action: "unchanged" };
  }
  const content = JSON.stringify(next, null, 2) + "\n";
  const action: FileAction = existing === undefined ? "create" : remove ? "remove" : "update";
  if (remove && JSON.stringify(next) === JSON.stringify(emptyShape)) {
    return { target, path: file, scope, action, content, deleteFile: true };
  }
  return { target, path: file, scope, action, content };
}

async function planJsonEntries(
  target: HarnessTarget,
  file: string,
  scope: "project" | "global",
  key: string,
  entries: Record<string, Record<string, unknown> | undefined>,
  fileDefaults: Record<string, unknown> = {}
): Promise<PlannedMcpFile> {
  const existing = await readText(file);
  let data: Record<string, unknown> = { ...fileDefaults };
  if (existing !== undefined && existing.trim() !== "") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(existing);
    } catch {
      const anyRemove = Object.values(entries).some((v) => v === undefined);
      if (anyRemove && !Object.keys(entries).some((k) => existing.includes(JSON.stringify(k)))) {
        return { target, path: file, scope, action: "unchanged" };
      }
      return {
        target,
        path: file,
        scope,
        action: "skip",
        note: "Not plain JSON (comments?), left untouched; merge the MCP server snippet by hand.",
      };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { target, path: file, scope, action: "skip", note: "Top level is not a JSON object." };
    }
    data = parsed as Record<string, unknown>;
  }
  const sub =
    data[key] && typeof data[key] === "object" && !Array.isArray(data[key])
      ? { ...(data[key] as Record<string, unknown>) }
      : {};
  let changed = false;
  for (const [name, entry] of Object.entries(entries)) {
    if (entry === undefined) {
      if (name in sub) {
        delete sub[name];
        changed = true;
      }
    } else if (JSON.stringify(sub[name]) !== JSON.stringify(entry)) {
      sub[name] = entry;
      changed = true;
    }
  }
  if (!changed && existing !== undefined) return { target, path: file, scope, action: "unchanged" };
  const next: Record<string, unknown> = { ...data };
  if (Object.keys(sub).length) next[key] = sub;
  else delete next[key];
  const allRemoving = Object.values(entries).every((v) => v === undefined);
  const remainingKeys = Object.keys(next).filter(
    (k) => !(k in fileDefaults) || JSON.stringify(next[k]) !== JSON.stringify(fileDefaults[k])
  );
  if (allRemoving && remainingKeys.length === 0) {
    return { target, path: file, scope, action: "remove", content: "", deleteFile: true };
  }
  const content = JSON.stringify(next, null, 2) + "\n";
  const action: FileAction = existing === undefined ? "create" : allRemoving ? "remove" : "update";
  return { target, path: file, scope, action, content };
}

async function planJsonEntry(
  target: HarnessTarget,
  file: string,
  scope: "project" | "global",
  key: string,
  entry: Record<string, unknown> | undefined,
  fileDefaults: Record<string, unknown> = {}
): Promise<PlannedMcpFile> {
  return planJsonEntries(target, file, scope, key, { [SERVER_NAME]: entry }, fileDefaults);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function planBlock(
  target: HarnessTarget | "instructions",
  file: string,
  scope: "project" | "global",
  startMarker: string,
  endMarker: string,
  blockBody: string | undefined,
  conflictCheck?: (existing: string) => string | undefined
): Promise<PlannedMcpFile> {
  const existing = await readText(file);
  const block = blockBody !== undefined ? `${startMarker}\n${blockBody.trim()}\n${endMarker}` : undefined;
  if (existing === undefined) {
    if (block === undefined) return { target, path: file, scope, action: "unchanged" };
    return { target, path: file, scope, action: "create", content: block + "\n" };
  }
  const pattern = new RegExp(`^[ \t]*${escapeRegExp(startMarker)}[\\s\\S]*?^[ \t]*${escapeRegExp(endMarker)}\\n?`, "m");
  const match = existing.match(pattern);
  if (match) {
    if (block === undefined) {
      const next = existing.replace(pattern, "").trimEnd();
      const content = next.length ? next + "\n" : "";
      return { target, path: file, scope, action: "remove", content, deleteFile: content === "" };
    }
    const next = existing.replace(pattern, block + "\n");
    if (next === existing) return { target, path: file, scope, action: "unchanged" };
    return { target, path: file, scope, action: "update", content: next };
  }
  if (block === undefined) return { target, path: file, scope, action: "unchanged" };
  if (conflictCheck) {
    const note = conflictCheck(existing);
    if (note) return { target, path: file, scope, action: "skip", note };
  }
  const separator = existing.length === 0 || existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
  const content = existing + separator + block + "\n";
  return { target, path: file, scope, action: "update", content };
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
  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  if (platform === "win32") {
    return path.join(appData ?? path.join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  }
  return path.join(home, ".config", "Claude", "claude_desktop_config.json");
}

export async function planHarnessInstall(options: InstallOptions, remove = false): Promise<PlannedMcpFile[]> {
  const project = path.resolve(options.projectPath);
  const home = options.homeDir ?? os.homedir();
  const platform = options.platform ?? process.platform;
  const plans: PlannedMcpFile[] = [];
  const env = { ANVIL_WORKSPACE: project };

  const targets = options.targets ?? DEFAULT_TARGETS;
  for (const target of targets) {
    const launch = launchFor(options, target);
    const stdio = { command: launch.command, args: launch.args };
    const pick = (entry: Record<string, unknown>) => (remove ? undefined : entry);
    switch (target) {
      case "claude":
        plans.push(await planJsonEntry(target, path.join(project, ".mcp.json"), "project", "mcpServers", pick(stdio)));
        break;
      case "cursor":
        plans.push(
          await planJsonEntry(
            target,
            path.join(project, ".cursor", "mcp.json"),
            "project",
            "mcpServers",
            pick({ ...stdio, env: { ANVIL_WORKSPACE: "${workspaceFolder}" } })
          )
        );
        break;
      case "vscode":
        plans.push(
          await planJsonEntry(
            target,
            path.join(project, ".vscode", "mcp.json"),
            "project",
            "servers",
            pick({ type: "stdio", ...stdio, env: { ANVIL_WORKSPACE: "${workspaceFolder}" } })
          )
        );
        break;
      case "antigravity":
        plans.push(
          await planJsonEntry(
            target,
            path.join(project, ".agents", "mcp_config.json"),
            "project",
            "mcpServers",
            pick({ ...stdio, env })
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

  if (options.hooks || remove) {
    for (const target of targets) {
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
    plans.push(await planBlock("instructions", path.join(project, "AGENTS.md"), "project", MD_START, MD_END, body));
    if (targets.includes("claude")) {
      plans.push(await planBlock("instructions", path.join(project, "CLAUDE.md"), "project", MD_START, MD_END, body));
    }
    if (targets.includes("gemini")) {
      plans.push(await planBlock("instructions", path.join(project, "GEMINI.md"), "project", MD_START, MD_END, body));
    }
  }
  return plans;
}

export async function applyHarnessPlan(plans: readonly PlannedMcpFile[]): Promise<PlannedMcpFile[]> {
  const written: PlannedMcpFile[] = [];
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

export function formatHarnessPlan(
  plans: readonly PlannedMcpFile[],
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
    conflict: "conflict",
    "keep-modified": "keep-modified",
    overwrite: "overwrite",
  };
  const lines = plans.map((plan) => {
    const label = plan.target === "instructions" ? "Agent instructions" : HARNESS_LABELS[plan.target];
    const line = `  ${(verb[plan.action] ?? plan.action).padEnd(13)} ${label.padEnd(26)} ${shown(plan.path)}`;
    return plan.note ? `${line}\n${" ".repeat(16)}${plan.note}` : line;
  });
  return lines.join("\n");
}
