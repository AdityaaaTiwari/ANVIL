# ANVIL Engineering Catalog

The **ANVIL Engineering Catalog** is a compact, natively curated library of specialist AI agent roles, engineering rules, domain skills, and workflow commands built for deterministic harness installation (`anvil install --profile ...`) across **Claude Code**, **Cursor**, **Codex**, **OpenCode**, **Google Antigravity**, **VS Code**, and **Gemini CLI**.

---

## Catalog Structure

```text
catalog/
├── agents/       # 49 concise specialist agent roles (planning, review, security, language & stack diagnostics)
├── skills/       # 76 compact lifecycle, architecture, DevOps, security, and stack skills
├── commands/     # 34 standardized workflow slash commands (/plan, /tdd, /verify, /shield, /review-pr, /handoff)
└── rules/        # 26 language & common engineering standard files across 14 stacks
```

---

## 1. Specialist Agents (`catalog/agents/`) — 49 Roles

- **Architecture & Planning:** `architect`, `planner`, `api-designer`, `data-engineer`, `ml-engineer`, `mcp-builder`, `loop-operator`, `context-optimizer`.
- **Review & Security:** `code-reviewer`, `security-reviewer`, `ci-security-reviewer`, `database-reviewer`, `payments-reviewer`, `mobile-reviewer`, `accessibility-reviewer`, `agent-evaluator`, `performance-engineer`, `refactor-cleaner`, `build-error-resolver`, `e2e-runner`, `tdd-guide`, `release-manager`, `technical-writer`, `ui-designer`.
- **Language Specialists:** `typescript-reviewer`, `python-reviewer`, `django-reviewer`, `fastapi-reviewer`, `rust-reviewer`, `go-reviewer`, `java-reviewer`, `kotlin-reviewer`, `csharp-reviewer`, `cpp-reviewer`, `php-reviewer`, `ruby-reviewer`, `swift-reviewer`, `react-reviewer`, `vue-reviewer`, and more.

Inspect available agents with:
```bash
anvil agents .
```
Or via MCP: `anvil_list_agents`.

---

## 2. Engineering Skills (`catalog/skills/` & `skills/`)

Each skill ships as a concise single-file `SKILL.md` with strict token discipline (`<= 40` lines):
- **`skills/` (`51` workspace skills):** Active repository skills discovered locally by `anvil skills .`.
- **`catalog/skills/` (`76` harness catalog skills):** Installable pack items selected automatically by stack and `--profile minimal | standard | full`, or individually via `anvil install --with skill:<id>`.

---

## 3. Workflow Commands (`catalog/commands/`) — 34 Commands

Standardized engineering workflow commands rendered natively per harness:
- Core ANVIL commands: `/consult`, `/context-budget`, `/cost`, `/evolve`, `/guard`, `/instincts`, `/loop`, `/mcp-sync`, `/race`, `/scorecard`, `/shield`
- Lifecycle commands: `/plan`, `/tdd`, `/verify`, `/review-pr`, `/code-review`, `/build-fix`, `/checkpoint`, `/security-scan`, `/security-review`, `/deps-audit`, `/perf`, `/handoff`, `/incident`, `/migrate`, `/spec`, `/test-coverage`, `/update-docs`, `/release-check`, `/a11y`, `/api-design`, `/explain`, `/learn`, `/refactor-clean`

---

## 4. Engineering Rules (`catalog/rules/`) — 26 Rule Sets Across 14 Stacks

Focused rule files organized by target technology:
- **`common/`:** Agents, coding style, documentation, evidence, git, performance, security, testing (`8` files).
- **Language & Framework Stacks:** `typescript/` (`3`), `golang/` (`2`), `python/` (`2`), `rust/` (`2`), plus `csharp/`, `dart/`, `java/`, `kotlin/`, `php/`, `react/`, `ruby/`, `swift/`, `vue/` (`1` each).

---

## 5. Binary & Provenance Intelligence

Native TypeScript inspection via `anvil binary .` (`anvil_binary_intelligence` MCP tool) detects PE, ELF, Mach-O, WASM, mobile packages, source maps, web bundles, and network captures locally without external disassembler bloat.
