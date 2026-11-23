# AI Agent Security Audit (`anvil agent-security`)

ANVIL provides deterministic, local-first security auditing for AI coding agent configurations, instructions, hooks, permissions, and tool definitions.

As AI agents (Claude Code, Cursor, Copilot, Antigravity, Codex, Windsurf, OpenCode) become deeply integrated into developer workflows, their configuration and instruction files represent an expanding attack surface. Prompt injections, malicious hooks, plain-text credentials in MCP configs, and unpinned dependencies can compromise local machines and continuous integration environments.

The `anvil agent-security` command scans workspace files and user profiles completely offline without sending any code or prompts to external LLMs.

---

## ⚡ Quick Start

### 1. Scan Current Workspace
Audit the current repository's instructions (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`), MCP configurations, and tool permissions:

```bash
anvil agent-security .
```

### 2. Include Global Per-User Configs
Audit global configs across your home directory (`~/.claude/settings.json`, `~/.codex/config.toml`, `~/.cursor/mcp.json`, Windsurf, Gemini, Claude Desktop):

```bash
anvil agent-security . --global
```

### 3. Generate SARIF for CI / GitHub Code Scanning
Export findings to OASIS SARIF v2.1.0 format to populate the **GitHub Security** tab:

```bash
anvil agent-security . --sarif agent-security.sarif
```

### 4. Output Machine-Readable JSON
```bash
anvil agent-security . --json
```

---

## 🔍 Scanned Files & Targets

ANVIL inspects configuration formats natively (JSON, TOML, Markdown, YAML) without relying solely on simple substring matches.

### Workspace Instruction Files
- `AGENTS.md`, `CLAUDE.md`, `CLAUDE.local.md`, `GEMINI.md`
- `.cursorrules`, `.windsurfrules`, `.clinerules`
- `.github/copilot-instructions.md`, `.github/instructions/**/*.md`, `.github/prompts/**/*.md`
- `.cursor/rules/*.mdc`, `.windsurf/rules/*`, `.agents/rules/*`, `.agent/rules/*`
- `.claude/skills/*`, `.claude/commands/*`, `.claude/agents/*`, `.anvil/skills/*`, `.forge/skills/*`

### Workspace Tool & MCP Configurations
- `.mcp.json`, `mcp.json`, `opencode.json`
- `.cursor/mcp.json`, `.vscode/mcp.json`, `.agents/mcp_config.json`, `.gemini/settings.json`
- `.claude/settings.json`, `.claude/settings.local.json`
- `.codex/config.toml`, `.zed/settings.json`
- `.anvil/hooks/*`, `.anvil/hooks.json`, `.claude/hooks/*`, `.forge/permissions.json`, `.forge/hooks.json`

### Global Per-User Configurations (`--global`)
When `--global` is passed, ANVIL scans configurations in the user's home directory:
- **Claude Code:** `~/.claude/settings.json`, `~/.claude/CLAUDE.md`
- **OpenAI Codex:** `~/.codex/config.toml`, `~/.codex/AGENTS.md`
- **Cursor:** `~/.cursor/mcp.json`
- **Windsurf:** `~/.codeium/windsurf/mcp_config.json`
- **Gemini CLI & Antigravity:** `~/.gemini/settings.json`, `~/.gemini/GEMINI.md`, `~/.gemini/antigravity/mcp_config.json`
- **OpenCode:** `~/.config/opencode/opencode.json`
- **Claude Desktop:** Platform configuration paths on macOS (`Library/Application Support/Claude/claude_desktop_config.json`), Windows (`AppData/Roaming/Claude/claude_desktop_config.json`), and Linux (`.config/Claude/claude_desktop_config.json`).

> [!NOTE]
> Personal findings from global user files are excluded from SARIF reports targeted at repository CI, ensuring user secrets and local paths are never committed or leaked into pull requests.

---

## 📋 Security Rule Catalog

ANVIL runs two complementary detection layers:
1. **Structured AST & Config Checks (`ANVIL-AGENT-101` – `112`)**: Syntax-aware parsers that understand JSON schemas, TOML tables, Claude Code hooks and permissions, and MCP server declarations.
2. **Instruction & Pattern Heuristics (`FORGE-AGENT-001` – `006`)**: Context-aware regex rules with negation and defensive-context guards.

### Structured Configuration Checks (`ANVIL-AGENT-101` .. `112`)

| Rule ID | Severity | Title | Detection Scope |
|---|---|---|---|
| `ANVIL-AGENT-101` | **Critical** | Hidden Unicode characters in agent instructions | Invisible zero-width characters (`U+200B`–`U+200F`), bidi override markers (`U+202A`–`U+202E`, `U+2066`–`U+2069`), word joiners (`U+2060`), and Unicode tag characters (`U+E0000`–`U+E007F`). These hide instructions that human reviewers cannot see in pull requests or editors, but LLMs parse and execute. |
| `ANVIL-AGENT-102` | **Critical** / **High** | Prompt-injection wording in agent instructions | Directives telling agents to ignore/override system instructions, enter developer/god/jailbreak mode, hide actions from the user, or exfiltrate credentials. Flagged as **Critical** when embedded inside HTML comments (`<!-- ... -->`) which render invisibly in Markdown viewers. |
| `ANVIL-AGENT-103` | **Critical** | Credential stored in plain text in an MCP server config or URL | High-entropy secrets (OpenAI, Anthropic, GitHub PATs, AWS, Google API keys, Slack tokens) hardcoded in `env`, `headers`, or URL parameters of an MCP server config. |
| `ANVIL-AGENT-104` | **High** | MCP server reached over unencrypted HTTP | Non-localhost MCP server URL utilizing unencrypted `http://` instead of `https://`, exposing tool calls, responses, and authorization headers to eavesdropping or MITM tampering. |
| `ANVIL-AGENT-105` | **Critical** | Downloaded or decoded code piped straight into a shell | MCP server launch commands or agent hooks piping network downloads or base64 decoding directly into a shell interpreter (e.g. `curl ... \| sh`, `wget ... \| bash`, `Invoke-WebRequest ... \| iex`, `base64 -d \| sh`). |
| `ANVIL-AGENT-106` | **Low** | MCP server package is not pinned to a version | Unpinned tool runners (`npx`, `bunx`, `uvx`, `pipx`, `pnpm dlx`) executing packages without explicit version tags (e.g. `npx -y package` instead of `package@1.2.3`). |
| `ANVIL-AGENT-107` | **High** | Agent may run any shell command without asking | Permissive shell execution configurations in Claude Code permissions (e.g., pre-approving `Bash`, `Bash(*)`, `*`, or `PowerShell(*)`). |
| `ANVIL-AGENT-108` | **High** | All permission prompts are switched off | Configuration enabling `defaultMode: "bypassPermissions"`, allowing arbitrary writes, deletes, and executions without human approval. |
| `ANVIL-AGENT-109` | **Medium** | Every MCP server in any opened project is trusted automatically | Configuration setting `enableAllProjectMcpServers: true`, allowing untrusted cloned repositories to spawn arbitrary local processes via `.mcp.json`. |
| `ANVIL-AGENT-110` | **Critical** / **Medium** | Command can send secrets over the network / Hook makes network calls | **Critical:** Command combines network tools (`curl`, `wget`, `Invoke-WebRequest`) with access to secrets (`.env`, SSH keys, environment variables).<br>**Medium:** Hook triggers automated outbound network calls on every event. |
| `ANVIL-AGENT-111` | **High** | Command can destroy files or history | Agent hook or MCP command runs destructive operations (`rm -rf /`, `rm -rf ~`, `git push -f`, `git reset --hard`, `git clean -f`, `del /s /q`, `mkfs`, `dd if=`) without confirmation. |
| `ANVIL-AGENT-112` | **High** / **Medium** | Codex sandbox is turned off / Codex never asks before running commands | OpenAI Codex `config.toml` sets `sandbox_mode = "danger-full-access"` or `approval_policy = "never"`. |

---

### Instruction Heuristics (`FORGE-AGENT-001` .. `006`)

| Rule ID | Severity | Title | Description |
|---|---|---|---|
| `FORGE-AGENT-001` | **Critical** | Credential value embedded in agent configuration | Identifies live credentials embedded in instruction documents. ANVIL automatically redacts matching values from output reports. |
| `FORGE-AGENT-002` | **High** | Arbitrary command execution is explicitly permitted | Natural language instructions advising an agent that it has permission to run arbitrary or unrestricted shell commands. |
| `FORGE-AGENT-003` | **High** | Destructive actions can bypass review | Text explicitly instructing agents to bypass human confirmation for deletion, deployment, or destructive operations. |
| `FORGE-AGENT-004` | **High** | Untrusted repository or tool content is treated as instructions | Directives telling agents to treat repository files, web content, or tool output as trusted system instructions (indirect prompt injection vulnerability). |
| `FORGE-AGENT-005` | **Medium** | Unrestricted filesystem access is described | Instructions stating that the agent has unrestricted access to the entire host filesystem. |
| `FORGE-AGENT-006` | **Medium** | Unrestricted network access is described | Instructions permitting unrestricted outbound internet connectivity without an explicit endpoint allowlist. |

---

## 🚦 Exit Codes

`anvil agent-security` returns predictable, script-friendly exit codes:

- **`0`**: **Clean.** All agent configurations and instructions passed inspection.
- **`1`**: **Scan Error / Failure.** Unhandled exception, missing argument, or file read error.
- **`2`**: **Critical Finding Detected.** One or more Critical severity findings were discovered (e.g. plain-text credentials, prompt injection in comments, curl-to-shell, or credential exfiltration).

---

## 🛡️ Integration with `anvil gate`

The agent security scanner is fully integrated into the `anvil gate` verification workflow. Whenever you run:

```bash
anvil gate .
```

`anvil gate` automatically runs `auditAgentConfiguration()` alongside AST architecture checks, quality metrics, and secret scans.

### Opting Out
To run `anvil gate` without scanning agent configuration files (e.g., in legacy environments with unmanaged instructions):

```bash
anvil gate . --skip-agent-config
```

---

## 🤖 GitHub Actions Workflow (SARIF Code Scanning)

You can run `anvil agent-security` as an automated security check on every Pull Request and upload findings directly to GitHub Code Scanning.

Create `.github/workflows/agent-security.yml`:

```yaml
name: AI Agent Security Scan

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read
  security-events: write

jobs:
  agent-security:
    name: Audit Agent Configurations
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install Dependencies
        run: npm ci

      - name: Run ANVIL Agent Security Audit
        run: |
          npx -y anvil-engineering-workbench@latest agent-security . --sarif agent-security.sarif
        continue-on-error: true

      - name: Upload SARIF to GitHub Code Scanning
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: agent-security.sarif
          category: anvil-agent-security
```

> Uses the npm package `anvil-engineering-workbench` (not `anvil`, which is an unrelated package). Requires version 1.3.0 or later, the first release with `--sarif` for `agent-security`.

---

## 🔒 Privacy & Secret Safety Guarantees

- **No Remote Calls:** All inspections run entirely in local memory. No instructions, rules, or configurations are sent to third-party endpoints or AI APIs.
- **Redaction by Design:** Any matched credential or secret value is stripped at the parser level and never written to stdout, JSON, or SARIF reports.
- **Global Config Isolation:** When auditing global user configurations (`--global`), per-user paths (`~/.claude`, `~/.codex`) are evaluated for local remediation but filtered out from SARIF reports to prevent accidental disclosure in CI.
