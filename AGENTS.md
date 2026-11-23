# AGENTS.md — AI Coding Assistant Guidelines for ANVIL

This repository and projects using the **ANVIL Engineering Workbench** provide local, deterministic MCP tools and CLI utilities to inspect architecture, evaluate change risk, audit quality, and scan for security vulnerabilities without sending code to third-party LLMs.

---

## Operating Principles for AI Agents

When working in this workspace, follow these operating rules:

### 1. Consult ANVIL MCP Tools Before Mass File Reads
- **Do not read dozens of files to understand architecture or imports.** Call `anvil_map_architecture` to get the module graph, entry points, and dependency relationships in a compact payload (~1,400 tokens, versus ~150,000 tokens to read every source file in ANVIL's own repo; your repo will differ).
- **Do not guess tech stack or scripts.** Call `anvil_inspect_project` to get languages, framework indicators, package managers, and script names.

### 2. Verify Blast Radius Before Committing
- Call `anvil_change_risk` or `anvil_git_intelligence` to compute:
  - Downstream modules impacted by your edits.
  - Recommended test files to run.
  - Overall structural risk rating (Low, Moderate, Elevated, High).

### 3. Run Quality & Security Checks Locally
- Call `anvil_security_audit` before committing to verify no hardcoded secrets or API tokens were introduced.
- Run `anvil_quality_audit` (or run `anvil gate` from CLI) to ensure tests, configurations, and repository hygiene satisfy baseline quality.

### 4. Understand Compact Mode & Context Budget
- By default, all ANVIL MCP inspection tools return **compact summaries** (`detail: false`) with `_meta` token estimations to preserve your context window.
- If you need full AST node graphs, every line-level finding, or entire file listings, pass `detail: true` to the respective tool.

---

## Quick Tool Reference

| Task | Recommended Tool | Why |
|---|---|---|
| Project stack / setup | `anvil_inspect_project` | Returns languages, package managers, frameworks, and scripts. |
| Codebase architecture | `anvil_map_architecture` | Deterministic import graph across TS, Python, Go, Rust, Java, C++; TypeScript AST symbol analysis. |
| Pre-commit risk check | `anvil_change_risk` | Computes blast radius, affected modules, and suggested test targets. |
| Working copy diff | `anvil_git_intelligence` | Structured diff, changed files list, and test recommendations. |
| Quality audit | `anvil_quality_audit` | Static heuristic project check (manifests, tests, workflows). |
| Secret scanning | `anvil_security_audit` | Entropy and pattern-based secret scanner with zero network calls. |
| Clean junk & orphans | `anvil_clean_preview` | Safe dry-run scan for caches, junk, and unreferenced source files. |
| Symbol lookup | `anvil_search_code` | Security-bounded symbol search excluding .env and dependencies. |
| Safe file read | `anvil_read_file` | Guarded file reader (max 128 KiB, traversal and secret protection). |
| Diagnostic check | `anvil_doctor` | Checks Node runtime, Git, Docker, and workspace permissions. |

---

## Local Verification Commands

Always verify changes before marking tasks complete:

```bash
# 1. Run Prettier format check
npm run format:check

# 2. Run ESLint
npm run lint

# 3. Build TypeScript to dist/
npm run build

# 4. Run full test suite with coverage
npx vitest run
```

---

## Environment Variables & Token Budgets

- `ANVIL_MAX_ESTIMATED_TOKENS_PER_AGENT`: Maximum estimated tokens allocated per agent evaluation.
- `ANVIL_MAX_TASK_DURATION_MS_BY_AGENT`: Maximum execution duration per agent task in milliseconds.
- `ANVIL_WORKSPACE`: Workspace root directory for MCP server tool execution (defaults to current working directory).
