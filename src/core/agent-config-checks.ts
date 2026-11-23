// Structured security checks for AI-agent configuration files.
//
// Unlike the line regexes in agent-security-audit.ts, these checks understand
// the files they read: Claude Code settings (permissions, hooks), MCP server
// definitions in every tool's format, and Codex's config.toml. They also look
// for hidden Unicode and prompt-injection phrasing in instruction files.
//
// Every function here is pure: content in, findings out. Matched values (for
// example a token in an MCP server's env) are never copied into a finding.

export type CheckSeverity = "critical" | "high" | "medium" | "low";

export interface ConfigFinding {
  id: string;
  severity: CheckSeverity;
  line: number;
  title: string;
  detail: string;
  recommendation: string;
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };
const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// ---------------------------------------------------------------- helpers

/** 1-based line of the first occurrence of `needle`, or 1 if not found. */
export function lineOf(content: string, needle: string, from = 0): number {
  const index = content.indexOf(needle, from);
  if (index < 0) return 1;
  let line = 1;
  for (let i = 0; i < index; i += 1) if (content.charCodeAt(i) === 10) line += 1;
  return line;
}

/** Line of the JSON property `"key"`, searched after the property `"after"` when given. */
function lineOfKey(content: string, key: string, after?: string): number {
  const start = after ? content.indexOf(JSON.stringify(after)) : 0;
  return lineOf(content, JSON.stringify(key), Math.max(0, start));
}

function shannonEntropy(value: string): number {
  const counts = new Map<string, number>();
  for (const ch of value) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

const KNOWN_TOKEN =
  /(?:sk-ant-[A-Za-z0-9_-]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[baprs]-[A-Za-z0-9-]{12,}|AIza[0-9A-Za-z_-]{30,}|AKIA[0-9A-Z]{16}|glpat-[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{36}|hf_[A-Za-z0-9]{30,}|(?:sk|rk)_live_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
const SECRET_NAME = /(?:key|token|secret|passw(?:or)?d|pwd|auth|credential|bearer|cookie|session)/i;
/** ${VAR}, $VAR, ${env:VAR}, {env:VAR}, %VAR% and similar references are not literals. */
const VARIABLE_REFERENCE =
  /^\s*(?:Bearer\s+|Token\s+|Basic\s+)?(?:\$\{[^}]+\}|\$[A-Z_][A-Z0-9_]*|\{env:[^}]+\}|%[A-Z_][A-Z0-9_]*%)\s*$/i;

/** True when `value` (stored under `name`) looks like a real credential rather than a reference or placeholder. */
export function looksLikeSecret(name: string, value: string): boolean {
  if (VARIABLE_REFERENCE.test(value)) return false;
  if (KNOWN_TOKEN.test(value)) return true;
  if (!SECRET_NAME.test(name)) return false;
  const bare = value.replace(/^(?:Bearer|Token|Basic)\s+/i, "");
  if (bare.length < 16 || /\s/.test(bare)) return false;
  if (/^(?:x+|\*+|<[^>]+>|your[-_].*|changeme|placeholder|example.*|test.*|dummy.*)$/i.test(bare)) return false;
  return shannonEntropy(bare) >= 3.5;
}

// ------------------------------------------------- hidden Unicode / prompt injection

const HIDDEN_CHARS = /[​-‏‪-‮⁠-⁤⁦-⁩﻿]|\uDB40[\uDC00-\uDC7F]/g;

const INJECTION_PHRASES: Array<{ pattern: RegExp; what: string }> = [
  {
    pattern:
      /\b(?:ignore|disregard|forget|override)\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|earlier|preceding|system)\s+(?:instructions|prompts?|rules|directions|messages)\b/i,
    what: "tells the agent to ignore its earlier instructions",
  },
  {
    pattern: /\byou\s+are\s+now\s+(?:in\s+)?(?:developer|god|jailbreak|dan|unrestricted|admin)\s+mode\b/i,
    what: "tries to switch the agent into an unrestricted 'mode'",
  },
  {
    pattern:
      /\b(?:do\s+not|don't|never)\s+(?:tell|inform|show|mention\s+(?:this\s+)?to|alert)\s+(?:the\s+)?(?:user|human|developer|operator)\b/i,
    what: "asks the agent to hide what it is doing from the user",
  },
  {
    pattern:
      /\b(?:send|upload|post|exfiltrate|transmit|copy)\b.{0,60}\b(?:\.env|env(?:ironment)?\s+variables|api\s+keys?|secrets?|credentials|ssh\s+keys?|id_rsa)\b.{0,60}\b(?:to|into)\s+(?:https?:\/\/|a\s+(?:remote|external)|the\s+(?:server|webhook|url))/i,
    what: "asks the agent to send secrets somewhere",
  },
];

const DEFENSIVE_CONTEXT =
  /\b(?:untrusted|do\s+not\s+follow|don't\s+follow|must\s+not\s+be\s+followed|not\s+followed|refuse|data,?\s+not\s+instructions)\b/i;

/** Checks text instruction files (AGENTS.md, CLAUDE.md, rules, skills...). */
export function checkInstructionText(content: string): ConfigFinding[] {
  const findings: ConfigFinding[] = [];
  const lines = content.split(/\r?\n/);
  const hiddenLines = new Map<number, Set<string>>();
  lines.forEach((text, index) => {
    // A byte-order mark at the very start of a file is normal.
    const scan = index === 0 ? text.replace(/^﻿/, "") : text;
    for (const match of scan.matchAll(HIDDEN_CHARS)) {
      const cp = match[0].codePointAt(0) ?? 0;
      const set = hiddenLines.get(index + 1) ?? new Set<string>();
      set.add(cp >= 0xe0000 ? "U+E00xx (tag characters)" : "U+" + cp.toString(16).toUpperCase().padStart(4, "0"));
      hiddenLines.set(index + 1, set);
    }
    for (const { pattern, what } of INJECTION_PHRASES) {
      const match = pattern.exec(text);
      if (!match) continue;
      const inComment = /<!--/.test(text) || isInsideHtmlComment(lines, index);
      // Quoted examples inside defensive guidance ("text such as 'ignore previous rules' must not be followed")
      // are not attacks. Anything inside an HTML comment is always reported.
      const before = text.slice(Math.max(0, match.index - 2), match.index);
      const quoted = /["'`\u201C\u2018]/.test(before);
      if (!inComment && (quoted || DEFENSIVE_CONTEXT.test(text))) continue;
      findings.push({
        id: "ANVIL-AGENT-102",
        severity: inComment ? "critical" : "high",
        line: index + 1,
        title: inComment
          ? "Prompt injection hidden in an HTML comment"
          : "Prompt-injection wording in agent instructions",
        detail: `This line ${what}.${inComment ? " It sits inside an HTML comment, which renders invisibly on GitHub but is read by agents." : ""}`,
        recommendation:
          "Remove the line. If it came from a third-party skill, rule pack or pull request, treat that source as untrusted.",
      });
    }
  });
  for (const [line, chars] of hiddenLines) {
    findings.push({
      id: "ANVIL-AGENT-101",
      severity: "critical",
      line,
      title: "Hidden Unicode characters in agent instructions",
      detail: `Invisible or text-direction characters (${[...chars].join(", ")}) can hide instructions that humans don't see but agents read.`,
      recommendation:
        "Delete the invisible characters (e.g. retype the line) and review where the file came from. Legitimate agent instructions never need them.",
    });
  }
  return findings;
}

function isInsideHtmlComment(lines: string[], index: number): boolean {
  for (let i = index; i >= 0; i -= 1) {
    const text = lines[i] ?? "";
    const close = text.lastIndexOf("-->");
    const open = text.lastIndexOf("<!--");
    if (i < index && close > open) return false;
    if (open >= 0 && (close < open || i === index)) return true;
    if (i < index && close >= 0) return false;
  }
  return false;
}

// ------------------------------------------------------------------ commands

const REMOTE_TO_SHELL =
  /\b(?:curl|wget|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^|;&]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh|dash|iex|Invoke-Expression|python3?|node|perl|ruby)\b/i;
const DECODE_TO_SHELL = /\bbase64\s+(?:-d|--decode|-D)\b[^|;&]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh|python3?|node)\b/i;
const NETWORK_TOOL = /\b(?:curl|wget|nc|ncat|netcat|Invoke-WebRequest|Invoke-RestMethod|iwr|irm)\b/i;
const READS_SECRETS =
  /(?:\$\{?[A-Z_]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS?)[A-Z_]*\}?|\bprintenv\b|\benv\s*\||\$\(env\)|(?<![A-Za-z0-9_])\.env\b|id_rsa|\.ssh\/|\.aws\/credentials|\.npmrc)/i;
const DESTRUCTIVE =
  /\brm\s+-[a-z]*r[a-z]*f?[a-z]*\s+(?:--no-preserve-root\s+)?(?:\/(?:\s|$|\*)|~|\$HOME|\$\{HOME\}|\*)|\bgit\s+push\b[^;&|]*\s(?:--force|-f)\b|\bgit\s+reset\s+--hard\b|\bgit\s+clean\s+-[a-z]*f|\bdel\s+\/[sq]|\bRemove-Item\b[^;&|]*-Recurse|\bmkfs\b|\bdd\s+if=/i;

/** Checks one shell command that an agent tool runs automatically (a hook or an MCP launch). */
export function checkCommand(command: string, line: number, kind: "hook" | "mcp", name: string): ConfigFinding[] {
  const findings: ConfigFinding[] = [];
  const where = kind === "hook" ? `Hook "${name}"` : `MCP server "${name}"`;
  if (REMOTE_TO_SHELL.test(command) || DECODE_TO_SHELL.test(command)) {
    findings.push({
      id: "ANVIL-AGENT-105",
      severity: "critical",
      line,
      title: "Downloaded or decoded code is piped straight into a shell",
      detail: `${where} runs code it fetches or decodes at run time, so whoever controls that source controls your machine.`,
      recommendation: "Install the tool from a pinned, reviewed package instead, and run it by path.",
    });
  }
  if (NETWORK_TOOL.test(command) && READS_SECRETS.test(command)) {
    findings.push({
      id: "ANVIL-AGENT-110",
      severity: "critical",
      line,
      title: "Command can send secrets over the network",
      detail: `${where} uses a network tool and also reads environment variables, .env files or key files. That is how credentials get exfiltrated.`,
      recommendation:
        "Remove the network call or the secret access. If a hook must report somewhere, send only non-sensitive data to a host you control.",
    });
  } else if (kind === "hook" && NETWORK_TOOL.test(command) && findings.length === 0) {
    findings.push({
      id: "ANVIL-AGENT-110",
      severity: "medium",
      line,
      title: "Hook makes network calls",
      detail: `${where} runs automatically and talks to the network on every trigger.`,
      recommendation: "Make sure the destination is yours and that no prompt, file content or secret is sent.",
    });
  }
  if (DESTRUCTIVE.test(command)) {
    findings.push({
      id: "ANVIL-AGENT-111",
      severity: "high",
      line,
      title: "Command can destroy files or history",
      detail: `${where} runs a destructive command (recursive delete, force push, hard reset or disk write) without asking.`,
      recommendation: "Remove it, or scope it to a known temporary directory and require confirmation.",
    });
  }
  return findings;
}

// ----------------------------------------------------------- MCP server maps

interface McpServer {
  name: string;
  command?: string | undefined;
  args: string[];
  env: Record<string, string>;
  headers: Record<string, string>;
  url?: string | undefined;
}

function toStringRecord(value: Json | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (isObject(value)) for (const [k, v] of Object.entries(value)) if (typeof v === "string") out[k] = v;
  return out;
}

function readServer(name: string, raw: Json): McpServer | undefined {
  if (!isObject(raw)) return undefined;
  let command: string | undefined;
  let args: string[] = Array.isArray(raw.args) ? raw.args.filter((a): a is string => typeof a === "string") : [];
  if (typeof raw.command === "string") command = raw.command;
  else if (Array.isArray(raw.command)) {
    // OpenCode: "command": ["npx", "-y", "pkg"]
    const parts = raw.command.filter((a): a is string => typeof a === "string");
    command = parts[0];
    args = [...parts.slice(1), ...args];
  } else if (isObject(raw.command) && typeof raw.command.path === "string") {
    // Zed: "command": { "path": "...", "args": [...] }
    command = raw.command.path;
    if (Array.isArray(raw.command.args)) args = raw.command.args.filter((a): a is string => typeof a === "string");
  }
  const url = typeof raw.url === "string" ? raw.url : typeof raw.serverUrl === "string" ? raw.serverUrl : undefined;
  return {
    name,
    command,
    args,
    env: { ...toStringRecord(raw.env), ...toStringRecord(raw.environment) },
    headers: toStringRecord(raw.headers),
    url,
  };
}

/** Finds MCP server definitions in any supported JSON format. */
export function findMcpServers(data: JsonObject): McpServer[] {
  const servers: McpServer[] = [];
  for (const key of ["mcpServers", "servers", "mcp", "context_servers"]) {
    const map = data[key];
    if (!isObject(map)) continue;
    for (const [name, raw] of Object.entries(map)) {
      const server = readServer(name, raw);
      if (server && (server.command || server.url)) servers.push(server);
    }
  }
  return servers;
}

const RUNNERS = new Set(["npx", "bunx", "uvx", "pipx", "dlx"]);

function unpinnedPackage(server: McpServer): string | undefined {
  const base =
    (server.command ?? "")
      .split(/[\\/]/)
      .pop()
      ?.replace(/\.(?:cmd|exe)$/i, "") ?? "";
  let args = server.args;
  if (base === "cmd" && /^\/c$/i.test(args[0] ?? "")) args = args.slice(1);
  const runner = base === "cmd" ? (args.shift() ?? "") : base;
  const isRunner = RUNNERS.has(runner) || ((runner === "pnpm" || runner === "yarn") && args[0] === "dlx");
  if (!isRunner) return undefined;
  const pkg = args.find((arg, i) => !arg.startsWith("-") && !(i === 0 && arg === "dlx"));
  if (!pkg || pkg.startsWith(".") || pkg.startsWith("/")) return undefined;
  const versioned = pkg.startsWith("@") ? pkg.slice(1).includes("@") : pkg.includes("@") || pkg.includes("==");
  return versioned ? undefined : pkg;
}

function isLocalHost(host: string): boolean {
  return /^(?:localhost|127(?:\.\d+){3}|\[::1\]|::1|0\.0\.0\.0)$/i.test(host);
}

/** Checks MCP server definitions: secrets in env/headers, plain-HTTP remotes, risky launch commands, unpinned packages. */
export function checkMcpServers(content: string, servers: McpServer[]): ConfigFinding[] {
  const findings: ConfigFinding[] = [];
  for (const server of servers) {
    const line = lineOfKey(content, server.name);
    for (const [label, values] of [
      ["env", server.env],
      ["headers", server.headers],
    ] as const) {
      for (const [key, value] of Object.entries(values)) {
        if (!looksLikeSecret(key, value)) continue;
        findings.push({
          id: "ANVIL-AGENT-103",
          severity: "critical",
          line: lineOfKey(content, key, server.name),
          title: "Credential stored in plain text in an MCP server config",
          detail: `MCP server "${server.name}" has a literal credential in ${label}.${key}. Config files like this are often committed or synced.`,
          recommendation: `Rotate the credential, then reference it from the environment instead (for example "${key}": "\${${key.toUpperCase().replace(/[^A-Z0-9]/g, "_")}}").`,
        });
      }
    }
    if (server.url) {
      try {
        const parsed = new URL(server.url);
        if (parsed.protocol === "http:" && !isLocalHost(parsed.hostname)) {
          findings.push({
            id: "ANVIL-AGENT-104",
            severity: "high",
            line,
            title: "MCP server reached over unencrypted HTTP",
            detail: `MCP server "${server.name}" talks to ${parsed.hostname} without TLS, so tool calls, results and any auth headers can be read or changed in transit.`,
            recommendation: "Use an https:// URL.",
          });
        }
        if (parsed.username || parsed.password || [...parsed.searchParams].some(([k, v]) => looksLikeSecret(k, v))) {
          findings.push({
            id: "ANVIL-AGENT-103",
            severity: "critical",
            line,
            title: "Credential embedded in an MCP server URL",
            detail: `The URL for MCP server "${server.name}" carries a credential (user info or a token query parameter).`,
            recommendation: "Rotate it and pass it in a header that references an environment variable.",
          });
        }
      } catch {
        // Not a URL we can parse; leave it to the tool.
      }
    }
    const full = [server.command ?? "", ...server.args].join(" ");
    findings.push(...checkCommand(full, line, "mcp", server.name));
    const pkg = unpinnedPackage(server);
    if (pkg) {
      findings.push({
        id: "ANVIL-AGENT-106",
        severity: "low",
        line,
        title: "MCP server package is not pinned to a version",
        detail: `MCP server "${server.name}" runs "${pkg}" without a version, so every start can pull a different (possibly compromised) release.`,
        recommendation: `Pin it, e.g. "${pkg}@1.2.3", and update deliberately.`,
      });
    }
  }
  return findings;
}

// ------------------------------------------------------- Claude Code settings

const UNRESTRICTED_SHELL = /^(?:Bash|Bash\(\s*\*?\s*\)|Bash\(\s*:?\*\s*\)|PowerShell|PowerShell\(\s*\*?\s*\)|\*)$/;

/** Collects every hook command in Claude Code-style `hooks` objects. */
function collectHookCommands(hooks: Json, path: string, out: Array<{ name: string; command: string }>): void {
  if (Array.isArray(hooks)) {
    hooks.forEach((item, i) => collectHookCommands(item, `${path}[${i}]`, out));
    return;
  }
  if (!isObject(hooks)) return;
  if (typeof hooks.command === "string") out.push({ name: path, command: hooks.command });
  for (const [key, value] of Object.entries(hooks)) {
    if (key === "command") continue;
    collectHookCommands(value, path ? `${path}.${key}` : key, out);
  }
}

/** Checks Claude Code settings.json (permissions, permission mode, hooks) and similar hook files. */
export function checkAgentSettings(content: string, data: JsonObject): ConfigFinding[] {
  const findings: ConfigFinding[] = [];
  const permissions = isObject(data.permissions) ? data.permissions : undefined;
  const allow = permissions && Array.isArray(permissions.allow) ? permissions.allow : [];
  for (const rule of allow) {
    if (typeof rule !== "string" || !UNRESTRICTED_SHELL.test(rule.trim())) continue;
    findings.push({
      id: "ANVIL-AGENT-107",
      severity: "high",
      line: lineOf(content, JSON.stringify(rule)),
      title: "Agent may run any shell command without asking",
      detail: `The permission rule ${JSON.stringify(rule)} pre-approves every shell command, including ones a prompt injection asks for.`,
      recommendation: 'Allow specific commands instead, e.g. "Bash(npm test:*)", "Bash(git status)".',
    });
  }
  const mode = permissions?.defaultMode ?? data.defaultMode;
  if (mode === "bypassPermissions") {
    findings.push({
      id: "ANVIL-AGENT-108",
      severity: "high",
      line: lineOf(content, '"bypassPermissions"'),
      title: "All permission prompts are switched off",
      detail: 'defaultMode "bypassPermissions" lets the agent edit, delete and run anything with no confirmation.',
      recommendation:
        'Use "default" or "acceptEdits", and only bypass permissions inside a disposable sandbox or container.',
    });
  }
  if (data.enableAllProjectMcpServers === true) {
    findings.push({
      id: "ANVIL-AGENT-109",
      severity: "medium",
      line: lineOf(content, '"enableAllProjectMcpServers"'),
      title: "Every MCP server in any opened project is trusted automatically",
      detail: "A cloned repository can add a .mcp.json that starts a server on your machine without you approving it.",
      recommendation: "Remove enableAllProjectMcpServers and approve project servers one by one.",
    });
  }
  if (data.hooks !== undefined) {
    const commands: Array<{ name: string; command: string }> = [];
    collectHookCommands(data.hooks, "", commands);
    for (const { name, command } of commands) {
      const line = lineOf(content, JSON.stringify(command).slice(1, 40));
      findings.push(...checkCommand(command, line, "hook", name || "hook"));
    }
  }
  return findings;
}

// ----------------------------------------------------------------- Codex TOML

interface TomlSection {
  name: string;
  line: number;
  values: Map<string, { value: string; line: number }>;
}

/** Minimal line-based TOML reader: enough for Codex's flat keys and [mcp_servers.*] tables. */
function readTomlSections(content: string): TomlSection[] {
  const sections: TomlSection[] = [{ name: "", line: 1, values: new Map() }];
  content.split(/\r?\n/).forEach((raw, index) => {
    const text = raw.replace(/^\s+/, "");
    if (!text || text.startsWith("#")) return;
    const header = /^\[([^\]]+)\]/.exec(text);
    if (header) {
      sections.push({ name: header[1]!.trim(), line: index + 1, values: new Map() });
      return;
    }
    const kv = /^([A-Za-z0-9_."-]+)\s*=\s*(.*)$/.exec(text);
    if (kv)
      sections[sections.length - 1]!.values.set(kv[1]!.replace(/"/g, ""), { value: kv[2]!.trim(), line: index + 1 });
  });
  return sections;
}

const tomlString = (raw: string): string | undefined => {
  const m = /^"((?:[^"\\]|\\.)*)"|^'([^']*)'/.exec(raw);
  return m ? (m[1] ?? m[2]) : undefined;
};
const tomlStrings = (raw: string): string[] =>
  [...raw.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'/g)].map((m) => m[1] ?? m[2] ?? "");

/** Checks Codex config.toml: sandbox/approval settings and [mcp_servers.*]. */
export function checkCodexToml(content: string): ConfigFinding[] {
  const findings: ConfigFinding[] = [];
  const sections = readTomlSections(content);
  for (const section of sections) {
    const isRootOrProfile = section.name === "" || section.name.startsWith("profiles.");
    if (isRootOrProfile) {
      const sandbox = section.values.get("sandbox_mode");
      if (sandbox && tomlString(sandbox.value) === "danger-full-access") {
        findings.push({
          id: "ANVIL-AGENT-112",
          severity: "high",
          line: sandbox.line,
          title: "Codex sandbox is turned off",
          detail: 'sandbox_mode = "danger-full-access" lets Codex read and write anywhere and use the network freely.',
          recommendation: 'Use "workspace-write" (or "read-only") and grant extra access per task.',
        });
      }
      const approval = section.values.get("approval_policy");
      if (approval && tomlString(approval.value) === "never") {
        findings.push({
          id: "ANVIL-AGENT-112",
          severity: sandbox && tomlString(sandbox.value) === "danger-full-access" ? "high" : "medium",
          line: approval.line,
          title: "Codex never asks before running commands",
          detail: 'approval_policy = "never" means commands run without confirmation.',
          recommendation: 'Use "on-request" or "untrusted" unless Codex runs in a disposable sandbox.',
        });
      }
    }
  }
  // MCP servers: [mcp_servers.NAME] plus optional [mcp_servers.NAME.env] / inline env = { ... }
  const servers = new Map<string, McpServer & { line: number }>();
  for (const section of sections) {
    const m = /^mcp_servers\.("?)([^".]+)\1(?:\.(env|http_headers|headers))?$/.exec(section.name);
    if (!m) continue;
    const name = m[2]!;
    const server = servers.get(name) ?? { name, args: [], env: {}, headers: {}, line: section.line };
    servers.set(name, server);
    if (m[3]) {
      for (const [key, { value }] of section.values) {
        const str = tomlString(value);
        if (str !== undefined) (m[3] === "env" ? server.env : server.headers)[key] = str;
      }
      continue;
    }
    for (const [key, { value }] of section.values) {
      if (key === "command") server.command = tomlString(value);
      else if (key === "args") server.args = tomlStrings(value);
      else if (key === "url") server.url = tomlString(value);
      else if (key === "env" || key === "http_headers") {
        for (const pair of value.matchAll(/([A-Za-z0-9_-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/g))
          (key === "env" ? server.env : server.headers)[pair[1]!] = pair[2] ?? pair[3] ?? "";
      }
    }
  }
  for (const server of servers.values()) {
    for (const finding of checkMcpServers(content, [server])) {
      // JSON key lookup does not apply to TOML; point at the server's section header instead.
      findings.push({ ...finding, line: server.line });
    }
  }
  return findings;
}

// -------------------------------------------------------------- dispatcher

/** Runs every structured check that applies to this file. */
export function checkConfigFile(relativePath: string, content: string): ConfigFinding[] {
  const lower = relativePath.toLowerCase();
  const findings: ConfigFinding[] = [];
  if (lower.endsWith(".toml")) {
    findings.push(...checkCodexToml(content));
  } else if (lower.endsWith(".json")) {
    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch {
      data = undefined;
    }
    if (isObject(data)) {
      findings.push(...checkMcpServers(content, findMcpServers(data)));
      findings.push(...checkAgentSettings(content, data));
    }
  }
  if (/\.(?:md|mdc|txt|yaml|yml)$/.test(lower) || /(?:^|\/)\.[a-z]+rules$/.test(lower)) {
    findings.push(...checkInstructionText(content));
  }
  return findings;
}
