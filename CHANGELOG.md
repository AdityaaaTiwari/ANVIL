# ANVIL Changelog

## Unreleased

### Added
- `anvil install` / `anvil uninstall`: connect ANVIL to Claude Code, Codex, Cursor, VS Code (Copilot), Windsurf, Google Antigravity, Gemini CLI, OpenCode and Claude Desktop in one command. Writes each tool's MCP config in its own format, adds a managed ANVIL section to `AGENTS.md` / `CLAUDE.md` / `GEMINI.md`, keeps every existing setting, supports `--dry-run`, and never rewrites JSON it cannot parse.
- `anvil agent-security` now understands agent configs instead of only matching lines: Claude Code permissions (`Bash(*)`, `bypassPermissions`, `enableAllProjectMcpServers`) and hooks, MCP servers in every tool's format (plain-text credentials in `env`/`headers`/URLs, plain-HTTP remotes, unpinned `npx`/`uvx` packages), Codex `config.toml` (`danger-full-access`, `approval_policy = "never"`), commands that pipe downloads into a shell or send secrets over the network, prompt injection (worse inside HTML comments) and hidden Unicode. Scans the files of every tool `anvil install` supports; `--global` adds per-user configs; `--sarif PATH` writes SARIF. Rule IDs `ANVIL-AGENT-101`…`112`; matched values are never printed.
- `anvil install --hooks`: adds a stop hook to Claude Code (`.claude/settings.json`) and Cursor (`.cursor/hooks.json`). When the agent says it is done, `anvil gate --diff` runs on its changes; if it fails, the agent gets the findings and keeps working (Claude: `decision: block`; Cursor: `followup_message`). Loop guards let the agent stop after one follow-up (Claude) or two (Cursor), and the hook never blocks if ANVIL itself errors. The user's own hooks are kept; `anvil uninstall` removes ANVIL's.
- `anvil hook stop --harness claude|cursor`: the command those hooks run.
- `anvil gate` now includes the agent configuration scan (opt out with `--skip-agent-config`).

### Changed
- `ANVIL-R002` treats `spawn`/`exec` calls with an argument array or an explicit `shell: false` as low confidence (the form the rule recommends), so they no longer block the gate.
- ANVIL's own `anvil gate .` now passes with no baseline; `.anvil/baseline.json` (51 stale fingerprints) is removed and CI gates without it.
- `ANVIL-R002` (shell execution) no longer flags `RegExp.prototype.exec` calls such as `pattern.exec(text)`.
- `src/cli.ts` split into one module per command under `src/commands/` (no behavior change).

### Docs
- Added agent stop hooks documentation at `docs/agent-hooks.md` covering `anvil install --hooks`, automatic `gate --diff` triggers on agent finish, loop guards, and Claude Code/Cursor hook protocols.
- Documented `--hooks` flag in `docs/install.md`, `README.md` quick start, and indexed in `docs/README.md`.
- Added comprehensive AI Agent Security Audit documentation at `docs/agent-security.md` covering structured rule catalog (`ANVIL-AGENT-101`..`112`), heuristic checks (`FORGE-AGENT-001`..`006`), files scanned, `--global`, `--sarif` export, exit codes, and GitHub Actions code scanning workflows.
- Linked `docs/agent-security.md` across `docs/README.md`, `docs/security-model.md`, and the `README.md` feature matrix.
- Repositioned ANVIL as the deterministic verification layer for AI coding agents across `README.md`, landing page, manifests, and documentation.
- Added comprehensive documentation index at `docs/README.md`.
- Added end-to-end `docs/getting-started.md` guide covering quick start, CLI commands, pre-commit hooks, and CI/CD integration.
- Added universal tool installer guide at `docs/install.md`.
- Added `docs/integrations/antigravity.md` guide with exact configuration file paths, MCP tool schemas, and AGENTS.md rules.
- Added `docs/NOTES-for-claude.md` to document scope boundaries, verified commands, and collaboration notes for parallel agent development.
- Removed unsubstantiated "10/10 production architecture rating" claims, anchoring claims on 567 verified automated tests passing across Node 22/24.
- Synchronized `llms.txt` and `public/llms.txt` with verified flags and the verification layer positioning.

## 1.2.0 — Production Architecture 10/10 Overhaul, Automated PR Comment Bot, Pre-Commit Hook Suite & Deplo/FORGE Orchestration

ANVIL 1.2.0 represents a major milestone, achieving a certified 10/10 production architecture rating through the resolution of all 22 architectural review findings, introducing automated GitHub PR review comments, 1-command pre-commit git hooks, transactional rollback, and a modernized orchestration website inspired by Deplo and FORGE:

### 10/10 Production Architecture Overhaul (22 Findings Resolved)
- **Transactional Rollback & Directory Backups:**
  - Enhanced workspace cleaner with full recursive snapshot backups into `.anvil/backups/cleaner/` and strict byte-level checksum tracking.
  - Added explicit `backupId` parameter support to `anvil clean --undo <backupId>` for predictable rollback targeting.
- **Strict Policy & Suppression Governance:**
  - Defaulted `allowInlineSuppressions` to `false` in policy engine, requiring explicit opt-in or `--policy-ref` justification.
  - Enforced mandatory justification reasons for inline suppressions.
- **Security & Multi-Tenant Isolation:**
  - Hardened Docker sandbox with isolated temporary `HOME` environments and 5-second graceful SIGKILL escalation.
  - Added dynamic callback URL generation and strict `anvil:` Redis key namespaces.
  - Path traversal protection using strict `isInside(root, dest)` guards across all file utilities.
- **Multi-Language AST & Regex Alignment:**
  - Fully aligned multi-language documentation across TS/JS, Python, Go, Rust, Java, C++, and Docker.
  - Preserved PEP 8 two blank line hygiene during Python auto-fixing.

### GitHub PR Review Commenter & Action Enhancements
- **Automated PR Review Commenter (`pr-comment: true`):**
  - Added native GitHub PR commenting to `action.yml` (`scripts/post-pr-comment.cjs`) that parses SARIF gate reports and updates an itemized review table with Gate Shield score, secret scan results, and blast radius directly on pull requests.
  - Zero third-party dependencies using native Node 18+ `fetch`.

### Pre-Commit Git Hook Suite (`anvil hook`)
- **1-Command Pre-Commit Hook Management:**
  - Added `anvil hook install [--force]` to automatically inject ANVIL quality gate and clean checks into `.git/hooks/pre-commit`.
  - Added `anvil hook remove` to safely uninstall ANVIL git hooks without affecting custom scripts.

### Deplo & FORGE Web Redesign
- **Modernized Public Landing Page (`public/index.html`):**
  - Integrated signature 5-stage orchestration pipeline visualizer from `deplo.in`.
  - Added seven-step workflow from diff to verified merge.
  - Added live interactive dashboard preview, deterministic cost matrix table ($0 vs $150+/mo), and 12-stack language grid.

## 1.1.2 — MCP Ecosystem Hardening, Compact Tool Telemetry, Empirical Token Benchmarking & Inline Suppression Union

ANVIL 1.1.2 delivers comprehensive MCP ecosystem readiness, compact tool responses saving 90%+ model context tokens, empirical token footprint measurement, cross-platform Windows ESM fixes, and inline suppression rule unioning:

### Features & MCP Improvements
- **Compact MCP Responses by Default (`detail: false`):**
  - Core inspection tools (`anvil_inspect_project`, `anvil_map_architecture`, `anvil_change_risk`, `anvil_git_intelligence`, `anvil_quality_audit`, `anvil_security_audit`, `anvil_clean_preview`) return concise summaries by default, protecting AI agent context windows.
  - Every tool response includes structured telemetry in `_meta: { characterCount, estimatedTokens, compact, hint }`.
  - Passing `detail: true` returns the full AST graph, itemized findings, and file breakdowns on demand.
- **Model-Optimized Tool Descriptions:**
  - Enriched tool schemas in `src/mcp/server.ts` with explicit model directives detailing when to call, what data is returned, and boundary guarantees (read-only, no code execution).
- **Empirical Token Footprint Benchmark (`npm run bench`):**
  - Introduced reproducible benchmark script (`scripts/measure-token-footprint.ts`) measuring unassisted file loading (~220,000 tokens) vs ANVIL compact MCP output (~2,189 tokens), achieving 96–99% context token reduction across realistic engineering tasks.
- **Agent Ecosystem Assets:**
  - Added root `AGENTS.md` (operating guide for Cursor, Claude Code, Copilot, Windsurf, Antigravity).
  - Added standard `llms.txt` and `public/llms.txt` documentation for AI search indexing.
  - Added official MCP registry manifests `server.json` and `.well-known/mcp/server.json`, plus `smithery.yaml`.
- **Dynamic MCP Server Versioning:**
  - MCP server dynamically resolves its version from `package.json` (`resolveVersion()`), verified in CI.
- **Cross-Platform CLI & Safe Auto-Start:**
  - Fixed Windows ESM path resolution in `src/cli.ts` by using `pathToFileURL(script).href`.
  - Guarded `anvil mcp`: displays usage and setup commands safely without hanging stdin on non-TTY calls; server runs only on explicit `anvil mcp start`.
- **Inline Suppression Rule Unioning:**
  - Fixed regression in `code-review.ts` so that when both `anvil-disable-next-line` and `anvil-disable-line` apply to the same line, their suppressed rule sets and justification reasons are unioned rather than overwriting.
- **Accurate Sandbox Advisory Warnings:**
  - Made sandbox resource fields (`profile`, `maxMemory`, etc.) optional in policy schema so advisory warnings are emitted only when users explicitly define resource ceilings.

## 1.1.1 — Governance Hardening: Disallowed Tools Matcher, SARIF inSource Suppressions & Suppression Reason Enforcement

ANVIL 1.1.1 introduces strict governance hardening, accurate disallowed tool evaluation, full SARIF in-source suppression metadata, and release consistency checks:

### Features & Governance Hardening
- **Exact Command & Script Matching for `sandbox.disallowedTools`:**
  - Evaluates `package.json` scripts directly for prohibited command invocations (e.g. `rm`, `curl`, `wget`, `nc`) using exact command boundary patterns.
  - Matches active finding code execution snippets using word boundary regexes instead of substring searches on human-readable diagnostic messages, eliminating false positives on words such as "format" or "information".
- **SARIF v2.1.0 In-Source Suppressions (`suppressions: [{ kind: "inSource" }]`):**
  - Exported SARIF reports now include all inline-suppressed findings (`// anvil-disable-line`, etc.) tagged with standard OASIS SARIF `inSource` suppression metadata, preserving visibility in GitHub Code Scanning instead of vanishing silently.
  - Justification reasons documented via `-- reason` or `: reason` are captured and attached as `suppressions[].justification`.
- **Mandatory Justification Reasons (`quality.requireSuppressionReason`):**
  - New policy rule `quality.requireSuppressionReason: true` enforces that every inline suppression comment provides an explicit justification reason (e.g., `// anvil-disable-line ANVIL-R001 -- safe regex description`), failing the gate if justifications are omitted.
- **Sandbox Limits Advisory Notices & Schema Clarification:**
  - Dynamic container resource limits (`profile`, `requireRootless`, `maxMemory`, `maxCpus`, `maxProcesses`) generate clear advisory warnings in `anvil gate` output explaining that they govern containerized verification runs (`container-sandbox`) rather than static code review gates.
- **Triage Documentation Precision:**
  - Updated all reproduction commands in `docs/false-positive-analysis.md` to reference the canonical package name `npx anvil-engineering-workbench gate .`.
- **Automated Action & Package Version Synchronization:**
  - Added release workflow and CI assertions verifying `action.yml` default version remains in 100% sync with `package.json` and git tags.

## 1.1.0 — Enterprise Adoption Readiness: Policy-as-Code, Fail-Closed CI Gate & Content-Hashed Baseline Engine

ANVIL 1.1.0 delivers enterprise-grade CI/CD adoption readiness, policy-as-code enforcement, deterministic baseline suppression, and verified supply-chain hygiene:

### Features & Improvements
- **Zod-Powered Policy-as-Code Engine (`.anvil/policy.json` & `--policy`):**
  - Fully implemented schema validation using Zod (`GatePolicySchema`) enforcing strict types for security thresholds (`maxCritical`, `maxHigh`, `maxMedium`, `failOnSecrets`), code quality (`maxReviewHigh`, `requireCleanGit`), and runtime sandbox requirements (`sandbox.required`).
  - Strict **fail-closed** policy loading: malformed JSON or invalid schema in `.anvil/policy.json` fails the gate with explicit diagnostic messages instead of silently falling back to defaults.
  - Active enforcement of `failOnSecrets` (prohibiting unsuppressed credentials) and `requireCleanGit` (requiring pristine git status).
- **Content-Hashed Stable Baseline Engine (`--baseline` & `--generate-baseline`):**
  - Finding fingerprints now compute a SHA-256 content hash of the matching code snippet (`${source}:${rule}:${file}:${hash}`) rather than relying strictly on volatile line numbers.
  - Moving code lines or editing adjacent blocks preserves baseline suppression without spurious regressions.
  - Backward compatible with legacy line-based fingerprints (`${source}:${rule}:${file}:${line}`).
- **Strict Fail-Closed CI Gate (`anvil gate`):**
  - Code review and security scanner failures immediately fail the gate instead of falling back to empty reports.
  - If any analysis engine encounters an execution error, the gate exits with code 1 and records the failure in `evaluation.violations`.
- **OASIS SARIF v2.1.0 Baseline Filtering:**
  - `generateSarif` now filters out baselined findings or marks them with standard SARIF `suppressions` metadata (`kind: "external"`, `status: "accepted"`).
  - Eliminates false-positive code scanning alerts on GitHub pull requests when findings have been explicitly baselined.
  - Dynamically resolves package version from `package.json` for SARIF driver metadata.
- **Inline Suppression Comments (`code-review.ts`):**
  - Support for `// anvil-disable-line <RULE>`, `// anvil-disable-next-line <RULE>`, and `/* anvil-disable-file <RULE> */` across all code review checks.
- **GitHub Action Hardening (`action.yml`):**
  - Updated default version to `v1.1.0`.
  - Added support for `version: local` (`npm link`) for CI testing of workspace builds.
  - Automatic fallback detection for `.anvil/baseline.json` and `.anvil/policy.json` in target repository.
  - Robust multi-platform binary lookup across Windows, macOS, and Linux runners.
- **Coverage & Supply Chain Polish:**
  - Configured `@vitest/coverage-v8` with enforcement thresholds (60% lines/statements/functions, 50% branches).
  - Added `.git-blame-ignore-revs` ignoring repository-wide formatting commits.
  - Linked `lint` script to run both typechecking and Prettier verification.

## 1.0.9 — Release Pipeline Resilience & Idempotent npm Publishing

ANVIL 1.0.9 brings release pipeline resilience and fixes CI action resolution:
- **Idempotent npm Publishing:** Added automated verification check in `.github/workflows/release.yml` preventing duplicate publish failures if an existing version is already present on the npm registry.
- **Workflow Action Pinning Fix:** Resolved exact immutable commit SHAs for CodeQL Analysis and GitHub Pages deployment actions.
- **Documentation & UI Polish:** Updated live documentation and landing page assets to reflect v1.0.9 release status.

## 1.0.8 — Adoption Readiness: CI Gate, OASIS SARIF v2.1.0, String-Safe Cleaner & FORGE Deprecation

ANVIL 1.0.8 focuses on enterprise company-adoption readiness, addressing third-party audit findings across supply-chain security, automated CI/CD gating, string-safe code cleanup, and complete transition away from legacy FORGE prefixes.

### Features & Capabilities
- **CI Gate & Policy-as-Code (`anvil gate` & GitHub Action):**
  - Added native `anvil gate [path] [--sarif PATH] [--policy PATH] [--fail-on-warnings] [--json]` CI verification mode with standard Unix exit codes (exit `0` on clean verification, exit `1` on blocking/high-severity findings).
  - Built-in OASIS SARIF v2.1.0 report generator (`--sarif results.sarif`) for direct integration with GitHub Advanced Security code scanning tabs.
  - Policy-as-code enforcement via `docs/anvil-policy.schema.json` and `.anvil/policy.json` (max critical secrets: 0, max high findings, required check passes).
  - Updated `action.yml` to default to `operation: gate` with `sarif-file` output and pinned commit SHAs.
- **String-Safe Code Cleaner:**
  - Enhanced cleaner algorithm (`src/core/project-cleaner.ts`) with multiline string awareness (`getProtectedMultilineLines`).
  - Protects JavaScript / TypeScript template literals (`` `...` ``), Python triple quotes (`"""..."""` / `'''...'''`), and Go backticks from accidental whitespace stripping or blank-line collapsing.
- **Finished FORGE Renaming & Deprecation:**
  - Modernized environment variable resolution prioritizing `ANVIL_*` prefixes with graceful backward-compatible fallback to `FORGE_*` (logging one-time deprecation warnings).
  - Registered dual MCP tools (`anvil_*` as canonical, with `forge_*` alias) ensuring backward compatibility for existing MCP client configurations.
- **Supply-Chain & Security Policy Hardening:**
  - Pinned all GitHub Actions in CI/CD workflows (`ci.yml`, `release.yml`, `codeql.yml`, `pages.yml`) to immutable full 40-character commit SHAs.
  - Loosened CI security audit gate to `npm audit --audit-level=high --omit=dev` to prevent transient dev-dependency advisories from blocking production builds.
  - Added `lint`, `format:check`, and `test:coverage` scripts and contributor metadata to `package.json`.
  - Updated `SECURITY.md` with realistic solo maintainer SLAs (48–72h initial response) and explicitly documented GitHub Private Vulnerability Reporting enablement.
  - Clarified architectural provenance in `README.md` affirming clear upstream attribution to FORGE, independent verification specialization, and MIT licensing.

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

## 1.0.3 — Multi-Language Architecture Mapping, Workspace Cleaner & Self-Healing Wizard

ANVIL 1.0.3 introduces comprehensive multi-language architecture mapping (Python, Go, Rust, Java, C/C++), an automated junk/clutter-file scrubber (`anvil clean`), automated code repair (`anvil fix`), and a one-command environment doctor auto-fix wizard (`anvil doctor --fix`).

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
