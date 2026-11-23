# ANVIL Engineering Catalog

The **ANVIL Engineering Catalog** provides a curated, production-tested library of specialist AI agent personas, engineering rules, lifecycle skills, workflow commands, and reverse-engineering intelligence templates.

All assets are designed to work deterministically with the ANVIL Workbench, Antigravity IDE, Claude Code, Cursor, Codex, and other AI coding assistants.

---

## Catalog Structure

```
catalog/
├── agents/      # 88+ specialist agent personas (architecture, review, security, performance, build fixes)
├── commands/    # 24 standardized workflow slash commands (/plan, /tdd, /verify, /review-pr, /handoff)
├── rules/       # Language and framework engineering standards (TypeScript, Python, Rust, Go, React, etc.)
├── skills/      # 40+ engineering lifecycle and analysis skills with triggers and execution steps
└── rea/         # Reverse-engineering guides, binary format specs, and clean-room protocol templates
```

---

## 1. Specialist Agents (`catalog/agents/`)

ANVIL includes 88 specialist personas categorized into:

- **Architecture & Planning:** `architect`, `a11y-architect`, `api-designer`, `planner`, `spec-miner`, `code-architect`.
- **Review & Verification:** `code-reviewer`, `security-reviewer`, `performance-engineer`, `database-reviewer`, `dependency-auditor`.
- **Language Specialists:** `typescript-reviewer`, `python-reviewer`, `rust-reviewer`, `go-reviewer`, `cpp-reviewer`, `react-reviewer`, `vue-reviewer`, `swift-reviewer`, `kotlin-reviewer`, `java-reviewer`, `csharp-reviewer`, `php-reviewer`, `ruby-reviewer`.
- **Build & Failure Resolution:** `build-error-resolver`, `debugger`, `react-build-resolver`, `rust-build-resolver`, `cpp-build-resolver`, `silent-failure-hunter`.
- **Operations & Reliability:** `devops-engineer`, `incident-responder`, `observability-engineer`, `release-manager`.

Inspect available agents with:
```bash
anvil agents .
```
Or via MCP: `anvil_list_agents`.

---

## 2. Engineering Rules (`catalog/rules/`)

Production-tested rules structured by stack:
- **`common/`**: Clean code, error boundaries, secret handling, logging conventions.
- **`typescript/`**: Strict typing, no-any, async safety, branded types.
- **`python/`**: Type annotations, pytest conventions, virtual environments, PEP 8.
- **`rust/`**: Ownership, borrowing, error handling (`Result`/`Option`), unsafe minimization.
- **`react/`**: Hook dependencies, server/client boundaries, memoization, accessible primitives.
- **`golang/`**: Error checking, interface pollution avoidance, concurrency safety.
- **`csharp/`, `java/`, `php/`, `ruby/`, `swift/`**: Idiomatic patterns and platform best practices.

---

## 3. Workflow Commands (`catalog/commands/`)

Standardized engineering workflows:
- `/plan`: Structured implementation planning with acceptance criteria.
- `/tdd`: Test-driven development red-green verification loops.
- `/verify`: Narrow, proportionate verification and test execution.
- `/review-pr`: Comprehensive code review for pull requests.
- `/build-fix`: Surgical build error and type error fixes.
- `/security-scan`: Local static secret and vulnerability audit.
- `/perf`: Algorithmic complexity and I/O bottleneck review.
- `/handoff`: Agent-to-agent or agent-to-human session context handoff.

---

## 4. Lifecycle Skills (`catalog/skills/` & `skills/`)

Skills follow standard `SKILL.md` packaging:
- YAML frontmatter with `name`, `description`, `triggers`, `tags`, and `version`.
- Scored trigger matching via `anvil_project_health` and agent loop selection.
- Core skills:
  - `agentic-engineering`: Eval-first decomposition and cost-aware model routing.
  - `agent-security-hardening`: Least privilege, prompt injection defense, and sandbox boundary guards.
  - `autonomous-loops`: Loop guards, iteration caps, and rollback strategies.
  - `architecture-decision-records`: ADR drafting and trade-off tracking.
  - `binary-analysis-reimplementation`: REA binary inspection and clean implementation.
  - `ai-regression-testing`: Invariant-first regression tests for AI-modified surfaces.

---

## 5. Reverse Engineering & Binary Intelligence (`catalog/rea/`)

Integration with Reverse Engineer Anything (REA) tools and specs:
- PE (`pe-imports.md`, `pe-certificates.md`, `pe-load-config.md`)
- ELF (`elf-dependencies.md`, `elf-notes.md`)
- Runtimes (`python-pyc.md`, `electron-fuses.md`, `dotnet-bundles.md`, `il2cpp-metadata.md`)
- Clean-Room Implementation Protocol (`clean-room-protocol.md`)

Inspect project binary assets with:
```bash
anvil rea .
```
Or via MCP: `anvil_rea_intelligence`.
