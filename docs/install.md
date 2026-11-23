# Universal AI Tool Installer (`anvil install`)

`anvil install` connects ANVIL to all your AI coding tools in one command. It registers the ANVIL Model Context Protocol (MCP) server in each tool's configuration file and appends standard operating instructions to `AGENTS.md` (and `CLAUDE.md` / `GEMINI.md` where applicable).

```bash
# Connect ANVIL to every detected AI tool in your current repository
npx -y anvil-engineering-workbench install .
```

---

## Supported AI Tools & Configuration Files

| AI Tool | Target Name | Configuration File | Scope |
|---|---|---|---|
| **Claude Code** | `claude` | `.mcp.json` | Project |
| **Cursor** | `cursor` | `.cursor/mcp.json` | Project |
| **VS Code (GitHub Copilot)** | `vscode` | `.vscode/mcp.json` | Project |
| **Google Antigravity** | `antigravity` | `.agents/mcp_config.json` | Project |
| **Gemini CLI** | `gemini` | `.gemini/settings.json` | Project |
| **OpenCode** | `opencode` | `opencode.json` | Project |
| **OpenAI Codex CLI / IDE** | `codex` | `~/.codex/config.toml` | User Home |
| **Windsurf** | `windsurf` | `~/.codeium/windsurf/mcp_config.json` | User Home |
| **Claude Desktop** | `claude-desktop` | OS AppData / Application Support | User Home (run with `--target claude-desktop`) |

> [!NOTE] ChatGPT vs. Codex
> The **ChatGPT** consumer web and desktop chat application cannot execute or connect to local stdio MCP servers on your workstation. For OpenAI models and agentic workflows, use **Codex** (OpenAI's coding agent CLI/IDE), which `anvil install` natively supports.

---

## Command Options & Usage

```text
Usage: anvil install [path] [options]
       anvil uninstall [path] [options]
```

### Options

| Flag | Description |
|---|---|
| `--target <list>` | Comma-separated list of tools, or `all` (default). Examples: `--target cursor,claude` or `--target antigravity`. (`all` installs all tools except `claude-desktop`). |
| `--server <mode>` | How tools start ANVIL: `npx` (default), `global`, or `local`. |
| `--dry-run` | Preview what files would be created or modified without making changes. |
| `--json` | Output the installation plan as machine-readable JSON. |
| `--no-instructions` | Configure MCP servers without modifying `AGENTS.md`, `CLAUDE.md`, or `GEMINI.md`. |

---

## Server Execution Modes (`--server`)

1. **`npx` (Default):**
   ```json
   { "command": "npx", "args": ["-y", "anvil-engineering-workbench", "mcp", "start"] }
   ```
   Requires no local installation or setup. Runs on demand.

2. **`global`:**
   ```json
   { "command": "anvil", "args": ["mcp", "start"] }
   ```
   Fastest startup. Uses your globally installed ANVIL binary (`npm install -g anvil-engineering-workbench`).

3. **`local`:**
   ```json
   { "command": "node", "args": ["/path/to/ANVIL/dist/mcp/server.js"] }
   ```
   Directly executes your local repository build for development and contributor testing.

---

## Safety & Non-Destructive Design

- **Preserves Existing Settings:** If a configuration file already exists (e.g. `.cursor/mcp.json` with other MCP servers), ANVIL preserves all existing entries and only adds or updates the `"anvil"` key.
- **Comment-Safe:** If a configuration file contains JSON comments, ANVIL refuses to touch it destructively and instead prints the exact snippet for you to copy and paste manually.
- **Idempotent:** Running `anvil install` multiple times reports existing configurations as unchanged without churn.

---

## Clean Uninstallation (`anvil uninstall`)

To remove ANVIL from your tools and restore original configurations:

```bash
# Uninstall from all tools
anvil uninstall .

# Uninstall from a specific tool
anvil uninstall . --target cursor
```

`anvil uninstall` removes the ANVIL server entry and instructions block. If ANVIL was the only MCP server configured in a file created by install, the empty configuration file is cleanly removed.
