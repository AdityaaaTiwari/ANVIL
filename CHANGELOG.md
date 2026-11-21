# ANVIL Changelog

## 1.0.7 — Architecture Decision Records (ADR), Deep Security Scanner & Live Workflow DAG Runner

ANVIL 1.0.7 introduces an integrated Architecture Decision Records (ADR) engine following the MADR standard, a comprehensive repository security and secret scanner with automated `.gitignore` auto-fix, and a real-time interactive multi-agent workflow DAG runner in the web dashboard.

### Features & Capabilities
- **Architecture Decision Records Engine (`anvil adr` & Web Dashboard):**
  - MADR (Markdown Architectural Decision Records) 3.0 standard directory structure initialized via `anvil adr init` under `docs/adr/`.
  - Create structured decision records with status (`proposed`, `accepted`, `rejected`, `superseded`, `deprecated`), context, consequences, and alternatives via `anvil adr new "Title"`.
  - Automated project memory synchronization via `anvil adr sync` (`POST /api/adrs/sync`), converting ephemeral decisions in `.anvil/memory.json` into permanent, version-controlled markdown ADRs.
  - Interactive visual ADR viewer and creator in the web dashboard under Architecture & Graph.
- **Deep Security & Secret Scanner (`anvil security` & Web Dashboard):**
  - High-entropy regex and format scanning for exposed API keys: OpenAI (`sk-...`), Anthropic (`sk-ant-...`), GitHub (`ghp_...`, `gho_...`, `github_pat_...`), AWS access keys (`AKIA...`), Google API keys (`AIza...`), Slack tokens (`xoxb-...`), and private keys (`BEGIN RSA/OPENSSH PRIVATE KEY`).
  - Detection of dangerous shell practices (unvetted `curl ... | bash` in scripts) and unencrypted HTTP package dependencies.
  - Detection of exposed, unignored sensitive files (`.env`, `.pem`, `.key`, `.pfx`, `.p12`).
  - Automated one-click remediation with `--fix` (`POST /api/security/fix`), updating `.gitignore` to safely quarantine exposed files and credentials.
  - Interactive Security Audit card in the dashboard's Self-Healing & Security tab with real-time status and "Auto-Fix via .gitignore" action.
- **Interactive Live DAG Workflow Runner:**
  - One-click live execution (`POST /api/workflows/:id/execute`) directly from the dashboard visual canvas and saved workflow cards.
  - Real-time Server-Sent Events (SSE) telemetry broadcast: `workflow_started`, `workflow_task_settled`, and `workflow_completed`.
  - Realistic multi-agent task execution simulation powered by `advanceRun` and `DemoAgentProvider`.
- **Interactive Landing Page Enhancements:** Added terminal tabs (`09 adr`, `10 security`) and updated live npm badges to v1.0.7.

## 1.0.6 — AI Harness MCP Wizard & Dashboard Project Memory Hub

ANVIL 1.0.6 introduces automated AI harness integration for modern editors (Cursor, Claude Code, Windsurf, VS Code), a dedicated Project Memory & Architectural Decisions hub, and native dual-path memory retention.

### Features & Capabilities
- **Automated AI Harness MCP Setup (`anvil mcp setup`):** Single-command configuration for developer environments:
  - `--client cursor`: Generates and non-destructively merges into `.cursor/mcp.json`.
  - `--client claude`: Generates the exact stdio command for Claude Code CLI registration.
  - `--client windsurf` & `--client vscode`: Configures `.windsurf/mcp_config.json` and `.vscode/mcp.json`.
  - `--client all`: Configures all supported IDE harnesses in one execution.
- **Project Memory & Architectural Decisions Hub (`anvil memory` & Web UI):**
  - Live interactive Project Memory panel directly in the web dashboard under Overview & Health.
  - Dropdown categorization (`decision`, `architecture`, `constraint`, `preference`, `fact`), input tags, and single-click addition/removal.
  - Seamless dual-path storage supporting modern `.anvil/memory.json` with fallback to `.forge/memory.json`.
  - Real-time token-budgeted context ranking so agent instructions receive prioritized architectural constraints without exceeding window limits.
- **Interactive Landing Page Demos:** Enhanced product site with interactive terminal simulation tabs (`05 mcp-setup`, `06 memory`) and stage explorer showcasing harness connections.

## 1.0.5 — Seamless Single-Page Dashboard & Showcase Telemetry Hub

ANVIL 1.0.5 enhances the local engineering experience with a seamless single-page dashboard architecture, pre-populated interactive showcase telemetry, automatic port fallback (`4173..4183`), and complete release pipeline synchronization.

### Features & Improvements
- **Seamless Single-Page Dashboard:** Converted the dashboard from hidden tabs into an all-in-one view where System Health, Self-Healing Cleaner, Specialist Agents & Workflow Studio, Architecture Graph, Benchmarks & Evaluation, and Workspace Explorer are all visible simultaneously, accompanied by sticky smooth-scroll navigation pills.
- **✨ Showcase Telemetry Mode:** Embedded an interactive toggle (active by default when 0 local runs exist) that simulates multi-agent execution traces, benchmark candidate matrices, token budget gauges, and self-healing verification trails so developers can explore ANVIL's full power out of the box.
- **Automatic Port Fallback Scanner:** Prevented `EADDRINUSE` fatal startup errors by automatically scanning available ports in range `4173..4183` if the default port is held by another process.
- **Self-Healing Cleaner Dashboard Hub:** Direct interactive browser controls to preview junk cleanup (`/api/clean/preview`), trigger safe repairs, list snapshots (`/api/clean/snapshots`), and execute single-click undo rollback directly from the web interface.
- **Client Script Hardening:** Eliminated font string escaping anomalies and reinforced element hydration lifecycle for error-free dashboard startup.

## 1.0.4 — Zero-Fear Rollback, Self-Healing Verification Loop & Framework Entrypoint Engine

ANVIL 1.0.4 introduces production-grade safety nets and developer velocity superpowers: instant single-command rollback (`anvil undo`), an automated self-healing test verification gate (`--verify`), Git pre-commit hook automation (`anvil hook install`), and framework-aware entrypoint resolution for modern full-stack frameworks.

### Features & Capabilities
- **Instant Rollback Engine (`anvil undo`):** Every destructive action (`anvil clean --apply` or `anvil fix`) automatically creates a byte-accurate snapshot in `.anvil/backups/<backup-id>/` before touching disk. Running `anvil undo` instantly restores deleted files, re-creates pruned directories, and reverts modified source code with 100% byte fidelity.
- **Self-Healing Test Verification Gate (`--verify`):** When `--verify` is passed to `anvil clean` or `anvil fix`, ANVIL automatically detects the project's test suite (`npm test`, `cargo test`, `pytest`, `go test ./...`) and runs it after applying repairs. If tests fail, ANVIL **automatically rolls back all changes** before the developer even notices, guaranteeing zero regression.
- **Framework-Aware Entry Point Manifests:** Solves false-positive orphan file detection across modern full-stack frameworks including Next.js, Remix, Nuxt, SvelteKit, FastAPI, Django, Celery, and Go/Rust CLI binaries. Convention-based routes (`page.tsx`, `layout.tsx`, `route.ts`, `urls.py`, `conftest.py`, `build.rs`, `cmd/**/main.go`) are automatically recognized as entrypoints.
- **Automated Git Pre-commit Hook (`anvil hook install`):** Generates and installs a lightweight `.git/hooks/pre-commit` hook that intercepts commits and prevents OS junk, partial downloads, and syntax errors from entering Git staging.

## 1.0.3 — Multi-Language Architecture Mapping, Farzi Cleaner & Self-Healing Wizard

ANVIL 1.0.3 introduces comprehensive multi-language architecture mapping (Python, Go, Rust, Java, C/C++), an automated junk/farzi-file scrubber (`anvil clean`), automated code repair (`anvil fix`), and a one-command environment doctor auto-fix wizard (`anvil doctor --fix`).

### Features & Capabilities
- **Multi-Language Architecture Mapping (`anvil map`):** Expanded from JS/TS to Python (with relative package imports), Go, Rust (`mod` resolution), Java/Kotlin, and C/C++ (`#include`). Internal import resolution accurately maps hundreds of module relationships across mixed-language repositories with 0 false-positive circular loops.
- **Automated Cleaner Engine (`anvil clean`):** Scans and safely prunes OS clutter (`.DS_Store`, `Thumbs.db`), incomplete downloads (`.crdownload`, `.part`, `.tmp`), error logs, editor swap/backup files, multi-language build caches (Python `__pycache__`/`*.pyc`, Java `*.class`, Rust/C++ `*.o`/`*.obj`/`*.pdb`), and empty directory residue. Supports safe dry-run preview by default, with `--apply` to execute.
- **Code Auto-Repair (`anvil fix` & `anvil clean --fix`):** Safely detects and prunes unused named imports in TypeScript/JavaScript and Python (`from x import a, b`), preserves TypeScript type specifiers, normalizes trailing whitespace, collapses excessive blank lines, and guarantees trailing newlines without breaking compilations.
- **Self-Healing Doctor Wizard (`anvil doctor --fix`):** Scaffolds missing `.anvil/` configuration directories (`agents/`, `skills/`, `workflows/`), creates multi-language safe `.gitignore`, generates `.env.example` templates, and initializes Git if absent.
- **Dashboard Stability & Null-Safety:** Resolved deferred element listener binding in `src/core/dashboard-server.ts` with universal safe listener wrappers (`on()`), ensuring real-time dashboard telemetry populates instantly without script halts.
- **CLI Brand & Help Unification:** Aligned all commands, help strings, and examples under the official `anvil` command.

## 1.0.2 — Maintainer & Contact Verification

ANVIL 1.0.2 updates official maintainer contact information, aligning all security, support, and package metadata with Aditya Tiwari (`m.g.atiwari28@gmail.com`).

### Changes
- Updated maintainer and support contacts across `README.md`, `SECURITY.md`, and `package.json` to Aditya Tiwari (`m.g.atiwari28@gmail.com`).
- Refreshed package metadata for npm registry synchronization.

## 1.0.1 — Rebranding, Modern Website & Documentation Polish

ANVIL 1.0.1 introduces a completely redesigned product website, high-definition SVG iconography, comprehensive documentation unification under the ANVIL brand, and cross-platform stability improvements.

### Enhancements & Fixes
- **Modern Landing Website (`public/index.html`):** Redesigned with an ultra-clean Obsidian and Anvil Copper dark design system, interactive package manager installer tabs (`npm`, `npx`, `pnpm`, `yarn`), interactive live terminal simulation with real-time output switching, and interactive 4-stage workbench explorer.
- **Self-Contained Vector Iconography:** Replaced external image references with 100% self-contained inline SVG brand marks to ensure zero broken images when viewing locally or offline.
- **Brand Unification:** Purged all remaining legacy branding across `docs/`, `action.yml`, workflow files, and dashboard server templates.
- **High-Resolution Banner:** Generated a brand new, crisp screenshot of the ANVIL engineering dashboard (`docs/anvil-dashboard.png`) for repository and npm README presentations.
- **Cross-Platform Test Stabilization:** Resolved Windows symlink traversal and 8.3 path canonicalization issues in CI workflows.

## 1.0.0 — First major release

ANVIL 1.0.0 brings the independent ANVIL engineering workbench together as a versioned, installable product. It is designed to provide a local-first alternative for teams and developers who want codebase intelligence, agent orchestration, reviewable workflows, and measurable verification.

### Product experience
- Local engineering dashboard with project overview, health snapshots, architecture and dependency graphs, run history, task inspection, approvals, traces, reviews, verification history, and benchmark/evaluation views.
- Workspace explorer and code search for inspecting project files and symbols.
- Agent Configuration Studio for custom agent and skill Markdown, snapshots, and benchmark-gated configuration promotion.
- Visual workflow editor for reusable specialist-agent pipelines and draft run creation.
- Provider readiness and diagnostics views that avoid exposing credential values.

### Engineering capabilities
- Project inspection, architecture mapping, dependency intelligence, engineering-risk analysis, change intelligence, and quality auditing.
- Specialist-agent orchestration with saved runs, incremental task settlement, approval gates, replay/retry, and resume recovery.
- Project memory, workspace skills, declarative hooks, permission policies, and bounded read-only workspace tools.
- Review history, dry-run patch validation, explicit patch approval records, and staged promotion APIs.
- Verification history, evaluation suites, benchmark matrices, regression comparisons, and experiment manifests.
- MCP server and CLI workflows for local engineering automation.

### Install and launch
```bash
npm install -g anvil-engineering-workbench
anvil --version
anvil init ./my-project
anvil dashboard ./my-project
```

The dashboard binds to localhost by default. Open the URL printed in the terminal.

### Important V1 boundaries
- The public Vercel website is a static product site. The live dashboard runs locally against a workspace selected on the user's machine; it is not a hosted multi-user dashboard.
- Provider-backed runs require the user's own supported provider configuration and credentials. No provider connection or API spend is included by this release.
- Native model tool-calling is currently limited to bounded read-only workspace tools for the OpenAI-compatible provider. Other documented providers remain proposal-only in the normal run path.
- MCP workspace tools are read-only. Patch validation is a dry run; patch promotion is a separately reviewed library API, not an automatic agent action.
- Local script verification executes project-controlled code on the host. Docker verification is opt-in and depends on the host runtime. Do not treat local execution or heuristic risk scores as a security guarantee.
- Rootless Docker, live provider end-to-end validation, and hosted multi-user operation are not claimed as verified V1 capabilities.

This release establishes the ANVIL product foundation. Future releases can expand integrations and hosted operation without weakening the local-first permission and approval model.
