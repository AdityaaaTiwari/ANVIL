# ANVIL Engineering Catalog

The **ANVIL Engineering Catalog** is an enterprise-grade, deterministic intelligence library providing specialist AI agent personas, engineering rules, lifecycle skills, workflow commands, hooks, and reverse-engineering intelligence templates.

All assets are designed to work locally and deterministically with the **ANVIL Workbench**, **Antigravity IDE**, **Claude Code**, **Cursor**, **Codex**, and modern AI coding assistants.

---

## Catalog Overview

```
catalog/
├── agents/       # 88 specialist agent personas (architecture, review, security, performance, build fixes)
├── skills/       # 348 comprehensive engineering lifecycle, architecture, and domain skills
├── commands/     # 113 standardized workflow slash commands (/plan, /tdd, /verify, /review-pr, /handoff)
├── rules/        # Language and framework engineering standards (TypeScript, Python, Rust, Go, React, etc.)
├── hooks/        # Agent safety hooks, memory persistence configs, and tool execution guards
├── contexts/     # Scoped context definitions for dev, research, and review sessions
├── workflows/    # Multi-agent orchestration workflows and execution pipelines
└── rea/          # Reverse Engineer Anything (REA) intelligence library
    ├── specs/    # 59 binary format specifications (PE, ELF, Pyc, Electron, .NET, WASM, DEX, etc.)
    ├── guides/   # 13 guide categories (Android, Apple, Data, EVM, Firmware, Native, WASM, Web, etc.)
    ├── reference/# MCP contracts, limits inventory, and reconstruction ledgers
    └── bridges/  # Disassembler & debugger bridges (Ghidra, Hopper, IDA, Cutter, pwndbg, mitmproxy)
```

---

## 1. Specialist Agents (`catalog/agents/`) — 88 Personas

ANVIL includes 88 specialist personas categorized into:

- **Architecture & Planning:** `architect`, `a11y-architect`, `api-designer`, `planner`, `spec-miner`, `code-architect`, `code-explorer`.
- **Review & Verification:** `code-reviewer`, `security-reviewer`, `performance-engineer`, `database-reviewer`, `dependency-auditor`, `comment-analyzer`, `silent-failure-hunter`.
- **Language Specialists:** `typescript-reviewer`, `python-reviewer`, `rust-reviewer`, `go-reviewer`, `cpp-reviewer`, `react-reviewer`, `vue-reviewer`, `swift-reviewer`, `kotlin-reviewer`, `java-reviewer`, `csharp-reviewer`, `php-reviewer`, `ruby-reviewer`, `dart-flutter-reviewer`.
- **Build & Failure Resolution:** `build-error-resolver`, `debugger`, `react-build-resolver`, `rust-build-resolver`, `cpp-build-resolver`, `dart-build-resolver`, `django-build-resolver`, `go-build-resolver`, `java-build-resolver`, `kotlin-build-resolver`, `pytorch-build-resolver`, `swift-build-resolver`.
- **AI & Emerging Tech:** `mle-reviewer`, `rag-pipeline-reviewer`, `prompt-engineer`, `agent-evaluator`, `gan-evaluator`, `gan-generator`, `gan-planner`.
- **Operations & Reliability:** `devops-engineer`, `incident-responder`, `observability-engineer`, `release-manager`, `network-architect`, `homelab-architect`.

Inspect available agents with:
```bash
anvil agents .
```
Or via MCP: `anvil_list_agents`.

---

## 2. Engineering Skills (`catalog/skills/` & `skills/`) — 348 Skills

Skills follow standard `SKILL.md` packaging with YAML frontmatter metadata:
- **`skills/`**: Active workspace skills (curated set kept comfortably within system file budgets).
- **`catalog/skills/`**: Full encyclopedia of 348 skills across:
  - Agentic lifecycle & loop control (`agentic-engineering`, `agent-security-hardening`, `autonomous-loops`, `ai-regression-testing`).
  - Architecture & design (`architecture-decision-records`, `api-design`, `spec-driven-development`, `blueprint`).
  - Code hygiene & verification (`tdd-workflow`, `verification-loop`, `secure-changes`, `refactoring-patterns`).
  - Full-stack performance (`performance-profiling`, `frontend-patterns`, `database-migrations`, `docker-best-practices`).
  - REA binary analysis (`rea-analysis-optimization`, `rea-tool-design`, `reverse-engineer-anything`, `rea-ci-tests-audit`).

---

## 3. Workflow Commands (`catalog/commands/`) — 113 Commands

Standardized engineering workflows executable across supported harnesses:
- `/plan`: Structured implementation planning with acceptance criteria and risks.
- `/tdd`: Test-driven development red-green verification loops.
- `/verify`: Narrow, proportionate verification and test execution.
- `/review-pr`: Comprehensive code review for pull requests.
- `/build-fix`: Surgical build error and type error resolution.
- `/security-scan`: Local static secret and vulnerability audit.
- `/perf`: Algorithmic complexity and I/O bottleneck review.
- `/handoff`: Agent-to-agent or agent-to-human session context handoff.
- Stack-specific commands: `/cpp-build`, `/cpp-review`, `/go-build`, `/go-review`, `/rust-build`, `/rust-review`, `/react-build`, `/react-review`, `/flutter-build`, `/flutter-review`, etc.

---

## 4. Engineering Rules (`catalog/rules/`) — 11 Stacks

Production-tested rules structured by technology stack:
- **`common/`**: Clean code, error boundaries, secret handling, logging conventions.
- **`typescript/`**: Strict typing, no-any, async safety, branded types.
- **`python/`**: Type annotations, pytest conventions, virtual environments, PEP 8.
- **`rust/`**: Ownership, borrowing, error handling (`Result`/`Option`), unsafe minimization.
- **`react/`**: Hook dependencies, server/client boundaries, memoization, accessible primitives.
- **`golang/`**: Error checking, interface pollution avoidance, concurrency safety.
- **`csharp/`, `java/`, `php/`, `ruby/`, `swift/`**: Idiomatic patterns and platform best practices.

---

## 5. Reverse Engineering & Binary Intelligence (`catalog/rea/`)

Comprehensive integration with Reverse Engineer Anything (REA):
- **Binary Format Specifications (`catalog/rea/specs/` - 59 specs):** PE imports/certificates, ELF dependencies/notes, Python pyc bytecode, Electron fuses, .NET single-file bundles, IL2CPP metadata, UnityFS, Mach-O/Apple IPS, Godot PCK, WASM modules, Android APK signatures, and GPU code objects.
- **Domain Guides (`catalog/rea/guides/` - 13 categories):** Android, Apple, Data, EVM, Firmware, HarmonyOS, JavaScript, Managed (.NET/JVM), Native (C/C++), Runtimes, Signals, WASM, and Web.
- **Disassembler & Tool Bridges (`catalog/rea/bridges/` - 13 tools):** Connectors and scripting bridges for Ghidra, Hopper Disassembler, IDA Pro, Cutter, pwndbg, mitmproxy, and Native process inspection.
- **Clean-Room Protocol (`catalog/rea/clean-room-protocol.md`):** Complete separation of Dirty Room (binary reverse engineering) and Clean Room (spec-based reimplementation) to prevent copyright contamination.

Inspect project binary assets with:
```bash
anvil rea .
```
Or via MCP: `anvil_rea_intelligence`.

---

## 6. Hooks & Contexts (`catalog/hooks/` & `catalog/contexts/`)

- **Hooks:** Pre-execution checks, credential boundary enforcement, session memory persistence (`antigravity-hooks.json`, `codex-hooks.json`, `hooks.json`).
- **Contexts:** Reusable environment definitions for focused AI execution (`dev.md`, `research.md`, `review.md`).
- **Workflows:** Declarative multi-agent execution pipelines (`orch-review.workflow.js`).
