# Google Antigravity (AGY) Integration Guide

ANVIL provides native, local Model Context Protocol (MCP) server support for **Google Antigravity (AGY)** and the Antigravity IDE.

When Antigravity is connected to ANVIL, the agent uses deterministic AST tools to inspect repository architecture, check change risk, and audit code quality instead of reading dozens of raw files and consuming high token counts.

---

## Architecture & Configuration Paths

Antigravity discovers MCP servers via standard configuration files. Depending on whether you want ANVIL available globally or scoped to a specific project workspace:

### 1. Global MCP Configuration Path
On Windows:
```text
%USERPROFILE%\.gemini\antigravity\mcp\anvil\
```
Example tested path:
```text
C:\Users\<username>\.gemini\antigravity\mcp\anvil\
```

On macOS / Linux:
```text
~/.gemini/antigravity/mcp/anvil/
```

### 2. Workspace MCP Configuration Path
Add ANVIL to your repository's local Antigravity configuration file at `.gemini/mcp.json` or `.antigravity/mcp.json`:

```json
{
  "mcpServers": {
    "anvil": {
      "command": "npx",
      "args": ["-y", "anvil-engineering-workbench", "mcp", "start"],
      "env": {
        "ANVIL_WORKSPACE": "${workspaceFolder}"
      }
    }
  }
}
```

---

## Quick Setup via ANVIL CLI

You can automatically register ANVIL with Antigravity and other detected AI assistants using:

```bash
# Setup MCP configuration
anvil mcp setup
```

---

## Agent Guidelines (`AGENTS.md`)

To instruct Antigravity to always consult ANVIL's local deterministic tools before making changes, place an `AGENTS.md` file in the root of your repository:

```markdown
# AGENTS.md — AI Coding Assistant Guidelines for ANVIL

When working in this workspace, follow these operating rules:

### 1. Consult ANVIL MCP Tools Before Mass File Reads
- Do not read dozens of files to understand architecture or imports. Call `anvil_map_architecture` to get the module graph and entry points in a compact payload (~1,400 tokens).
- Do not guess tech stack or scripts. Call `anvil_inspect_project` to get languages, framework indicators, package managers, and script names.

### 2. Verify Blast Radius Before Committing
- Call `anvil_change_risk` or `anvil_git_intelligence` to compute:
  - Downstream modules impacted by your edits.
  - Recommended test files to run.
  - Overall structural risk rating.

### 3. Run Quality & Security Checks Locally
- Call `anvil_security_audit` before committing to verify no hardcoded secrets or API tokens were introduced.
- Run `anvil_quality_audit` (or run `anvil gate` from CLI) to ensure tests, configurations, and repository hygiene satisfy baseline quality.
```

---

## Available MCP Tools in Antigravity

ANVIL exposes these read-only deterministic tools to Antigravity:

| Tool Name | Purpose in Antigravity |
|---|---|
| `anvil_inspect_project` | Auto-detects languages, package managers, frameworks, and scripts. |
| `anvil_map_architecture` | Multi-language import graph (TS, Python, Go, Rust, Java, C++) and TypeScript AST symbols. |
| `anvil_change_risk` | Blast radius, downstream affected files, and recommended test targets. |
| `anvil_git_intelligence` | Working copy git diff, uncommitted files, and commit risk evaluation. |
| `anvil_quality_audit` | Fast static quality audit across manifests, tests, and configurations. |
| `anvil_security_audit` | Deep scan for hardcoded secrets, API keys, and sensitive tokens. |
| `anvil_clean_preview` | Safe preview scan of OS junk, build caches, and orphan files. |
| `anvil_search_code` | Guarded symbol search excluding `.env`, dependencies, and secrets. |
| `anvil_read_file` | Security-bounded file reader (max 128 KiB with path traversal protection). |
| `anvil_project_health` | Unified 0–100 health score and letter grade (A–F). |
| `anvil_doctor` | Diagnostic check on Node runtime, Git, Docker, and permissions. |

---

## Example Antigravity Workflow

When asking Antigravity to implement a feature or refactor code:

1. **Onboarding / Understanding:**
   > *"Inspect this repository and describe its architecture."*
   >
   > Antigravity calls `anvil_inspect_project` and `anvil_map_architecture` to understand the codebase in ~1,400 tokens instead of reading dozens of files.

2. **Evaluating Changes:**
   > *"I made edits to the authentication flow. Check what tests I should run."*
   >
   > Antigravity calls `anvil_change_risk` to find downstream affected modules and recommended test files.

3. **Pre-Commit Verification:**
   > *"Check if any secrets or policy violations were introduced."*
   >
   > Antigravity calls `anvil_security_audit` and `anvil_quality_audit` locally.
