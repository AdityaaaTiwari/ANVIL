# ANVIL Model Context Protocol (MCP) Server

ANVIL includes a zero-cloud Model Context Protocol (MCP) server that exposes codebase intelligence, architecture graphs, quality audits, and change risk directly to AI developer tools such as Claude Code, Cursor, Windsurf, VS Code, and Google Antigravity.

---

## 1-Minute Quick Setup

### Option 1: Claude Code (One Terminal Command)
```bash
claude mcp add anvil -- npx -y anvil-engineering-workbench mcp start
```

### Option 2: Cursor (`.cursor/mcp.json`)
Add ANVIL to `.cursor/mcp.json` in your repository:
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

### Option 3: Built-in Setup Wizard
Run the setup wizard from your project directory:
```bash
# Auto-configure all detected AI clients (Cursor, VS Code, Windsurf) and print Claude Code command
anvil mcp setup
```

---

## Token Efficiency & Context Protection

AI coding models have limited context windows and charge per token. Reading dozens of raw source files just to understand architecture or check diff blast radius wastes thousands of tokens.

**ANVIL executes analysis entirely locally on CPU without LLM calls.** By default, tools return **compact summaries** (`detail: false`), which were 96–99% smaller than the files they summarize in our benchmark on this repository (payload size only, not an end-to-end agent measurement).

Every response includes telemetry in `_meta`:
```json
{
  "_meta": {
    "characterCount": 848,
    "estimatedTokens": 212,
    "compact": true,
    "hint": "Pass detail: true to view full dependency manifests and detailed script definitions."
  },
  "root": "/path/to/project",
  "languages": [{ "name": "TypeScript", "files": 28 }],
  "filesScanned": 150
}
```

To receive full AST graphs, all line-level findings, or complete file items, pass `detail: true` to the respective tool.

See [Token Benchmark Results](token-benchmark-results.md) for reproducible, empirical measurements on the ANVIL codebase.

---

## Available MCP Tools

All tools are bounded, run locally within your workspace boundaries, and expose canonical `anvil_*` names:

| Tool Name | Model Directive / Purpose | Compact Default |
|---|---|:---:|
| `anvil_inspect_project` | Inspect project structure, languages, frameworks, package managers, scripts, and dependencies. Call first on onboarding. | Yes (`detail: false`) |
| `anvil_map_architecture` | In-memory import graph across TS, JS, Python, Go, Rust, Java, C++; TypeScript AST symbols. Call before planning refactors or tracing imports. | Yes (`detail: false`) |
| `anvil_change_risk` | Blast radius, downstream affected modules, and candidate test targets. Call before committing or opening PRs. | Yes (`detail: false`) |
| `anvil_git_intelligence` | Working-tree git diff, uncommitted changes, affected modules, and heuristic commit risk. | Yes (`detail: false`) |
| `anvil_quality_audit` | Fast static quality audit across manifests, tests, workflows, and security patterns. | Yes (`detail: false`) |
| `anvil_security_audit` | Deep scan for hardcoded secrets, API keys, and sensitive tokens with zero network calls. | Yes (`detail: false`) |
| `anvil_clean_preview` | Safe preview scan of OS junk, build caches, temp downloads, and orphan source modules. | Yes (`detail: false`) |
| `anvil_search_code` | Search symbols and text with automatic secret, `.env`, and `node_modules` exclusion. | - |
| `anvil_list_files` | Directory listing bounded to 200 items, filtering out secrets, symlinks, and caches. | - |
| `anvil_read_file` | Read source files up to 128 KiB with strict path traversal prevention. | - |
| `anvil_project_health` | Unified 0–100 health score and letter grade (A–F) combining tooling and architecture. | - |
| `anvil_list_agents` | List specialist engineering personas (architecture, reviewer, security, tester, release). | - |
| `anvil_create_review_plan` | Draft a structured multi-role engineering review workflow for a given goal. | - |
| `anvil_agent_intelligence` | Read-only analysis of agent effectiveness and recurring failure modes across benchmark history. | - |
| `anvil_remediation_plan` | Advisory dependency remediation and upgrade plan with human approval guardrails. | - |
| `anvil_agent_optimization` | Suggest harness configuration and agent prompt optimizations from local benchmark history. | - |
| `anvil_project_memory` | Read saved project decisions and architecture constraints within a token budget. | - |
| `anvil_agent_security_audit` | Audit agent instructions, skills, hooks, and permissions for prompt injection and secret leaks. | - |
| `anvil_dependency_impact` | Analyze manifest changes and undeclared imports against a git base revision. | - |
| `anvil_binary_intelligence` | Inventory compiled binaries, source maps, WASM, magic-byte headers, and provenance rules in the workspace. | - |
| `anvil_app_inspect` | Inspect one APK, IPA, Electron asar, WASM module, source map or JS bundle: manifest and Electron risks, embedded credentials (masked), endpoints | `relativePath` |
| `anvil_scorecard` | Compute deterministic 9-category harness readiness scorecard across install, guards, gates, memory, learning, and CI. | - |
| `anvil_consult` | Recommend catalog agents, skills, commands, rules, and MCP servers for a given task. | - |
| `anvil_context_budget` | Measure pre-prompt context tokens loaded across configured harnesses. | - |
| `anvil_guard_check` | Evaluate a planned tool command or file action against ANVIL Guard security rules. | - |
| `anvil_doctor` | Run diagnostic health checks on Node runtime, Git, Docker, and workspace permissions. | - |

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `ANVIL_WORKSPACE` | Absolute path to the workspace root directory. | Current working directory (`process.cwd()`) |
| `ANVIL_MAX_ESTIMATED_TOKENS_PER_AGENT` | Maximum estimated tokens allowed per agent run. | Unset (unlimited) |
| `ANVIL_MAX_TASK_DURATION_MS_BY_AGENT` | Maximum task duration in milliseconds for an agent task. | Unset (unlimited) |
