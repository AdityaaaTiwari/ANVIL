<!-- ANVIL — AI Harness for software engineering -->

<p align="center">
  <img src="https://raw.githubusercontent.com/anvil-workbench/ANVIL/main/docs/anvil-dashboard.png?v=2" alt="ANVIL AI Harness dashboard" width="100%" />
</p>

<h1 align="center">ANVIL — The AI Engineering Harness</h1>

<p align="center">
  <strong>An open-source AI engineering harness for orchestrating agents, understanding codebases, reviewing changes, and verifying results.</strong>
</p>

<p align="center">
  <a href="https://github.com/AdityaaaTiwari" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none;vertical-align:middle"><img src="https://img.shields.io/badge/Author-Aditya%20Tiwari-c47b52?style=flat" alt="Aditya Tiwari" style="display:block;border:0" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT license" /></a>
</p>

<p align="center">
  <a href="https://github.com/anvil-workbench/ANVIL"><img src="https://img.shields.io/github/stars/anvil-workbench/ANVIL?style=flat" alt="GitHub stars" /></a>
  <a href="https://github.com/anvil-workbench/ANVIL/forks"><img src="https://img.shields.io/github/forks/anvil-workbench/ANVIL?style=flat" alt="GitHub forks" /></a>
  <a href="https://github.com/anvil-workbench/ANVIL/commits/main"><img src="https://img.shields.io/github/last-commit/anvil-workbench/ANVIL?style=flat" alt="Last commit" /></a>
  <a href="https://github.com/anvil-workbench/ANVIL/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/anvil-workbench/ANVIL/ci.yml?branch=main&style=flat&label=build" alt="Build status" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/AI%20Harness-Agent%20Orchestration-7c3aed?logo=probot&logoColor=white" alt="AI harness and agent orchestration" />
  <img src="https://img.shields.io/badge/Agent%20Workflows-Review%20%26%20Verify-2563eb?logo=githubactions&logoColor=white" alt="Agent workflows, review and verification" />
  <img src="https://img.shields.io/badge/MCP-Read--only%20Tools-0f766e?logo=protocols&logoColor=white" alt="MCP read-only tools" />
  <img src="https://img.shields.io/badge/Runtime-Node.js%2022%2B-339933?logo=nodedotjs&logoColor=white" alt="Node.js 22+" />
  <img src="https://img.shields.io/badge/Language-TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-64748b?logo=linux&logoColor=white" alt="Windows macOS Linux" />
  <img src="https://img.shields.io/badge/Architecture-Local--first-0f766e?logo=shield&logoColor=white" alt="Local-first architecture" />
</p>

<p align="center">
  <strong>Built and maintained by <a href="https://github.com/AdityaaaTiwari">Aditya Tiwari</a></strong>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#features">Features</a> ·
  <a href="#dashboard">Dashboard</a> ·
  <a href="#ai-providers">AI providers</a> ·
  <a href="#integrations">Integrations</a> ·
  <a href="#security-model">Security</a> ·
  <a href="#roadmap">Roadmap</a>
</p>

---

> [!NOTE]
> **ANVIL v1.0.9 — AI harness foundation.** The local CLI, local dashboard, agent orchestration, MCP server, provider adapters, GitHub Action, automated self-healing cleaner, byte-accurate rollback (`anvil undo`), pre-commit hooks (`anvil hook install`), AI harness wizard (`anvil mcp setup`), Architecture Decision Records (`anvil adr`), Security & Secret Scanner (`anvil security --fix`), deterministic CI quality & security gate (`anvil gate` with SARIF v2.1.0 and policy-as-code), and live interactive workflow DAG runner are available. See [Current capabilities and boundaries](#current-capabilities-and-boundaries).

## What is ANVIL?

**ANVIL (ANVIL Engineering Workbench)** is a local-first AI engineering harness for developers who want more than a chat window pointed at a repository.

It brings codebase understanding, specialist-agent workflows, engineering review, human approval, verification, experiment tracking and a live local dashboard into one inspectable system.

ANVIL is built around a simple engineering loop:

```text
inspect → understand → plan → propose → review → approve → verify → learn
```

The goal is not to let an agent silently take over a project. The goal is to make AI-assisted engineering **observable, reviewable and evidence-driven**: proposals remain proposals until a person approves the next step.

### At a glance

| | ANVIL provides |
|---|---|
| **Codebase intelligence** | Project inventory, code search, architecture maps, dependency analysis and change impact |
| **Agent harness** | Specialist roles, skills, hooks, provider routing, task orchestration and run history |
| **Engineering control** | Review plans, patch validation, approval records, staged workflows and explicit verification |
| **Evaluation loop** | Evaluation suites, benchmark matrices, regression comparisons and experiment history |
| **Operator experience** | CLI, local dashboard, execution traces, configuration studio and workspace explorer |
| **Interoperability** | Read-only MCP server, Claude Code CLI adapter, Cursor MCP configuration and GitHub Action |

## Quick start

### Requirements

- **Node.js 22 or newer**
- npm (included with Node.js)
- Git (recommended for Git-aware features)
- Windows, macOS or Linux

Check your environment:

```bash
node --version
npm --version
git --version
```

### Install ANVIL

Install the released CLI via npm:

```bash
npm install --global anvil-engineering-workbench
```

Or install directly from the GitHub repository:

```bash
npm install --global git+https://github.com/anvil-workbench/ANVIL.git#v1.0.9
```

Verify the installation:

```bash
anvil --version
anvil --help
```

### Initialize and inspect a project

Open a terminal in the repository you want to work on:

```bash
cd /path/to/your-project

# 1. Run environment and project health diagnostics
anvil doctor

# 2. Inspect project architecture, tooling, and dependencies
anvil inspect .

# 3. Preview workspace clutter and unused imports (safe dry run)
anvil clean .

# 4. Start the local engineering dashboard
anvil dashboard .
```

To execute cleanup and code auto-repair with automatic byte-accurate snapshot backup:
```bash
anvil clean . --apply --fix
```

ANVIL prints the dashboard's local URL. Open that address in your browser.

### Windows PowerShell

```powershell
# Check prerequisites
node --version
npm --version
git --version

# Install ANVIL
npm install --global git+https://github.com/anvil-workbench/ANVIL.git#v1.0.9

# Move into your project
cd C:\Users\YourName\Projects\my-project

# Run diagnostics, inspect, preview clean, and launch dashboard
anvil doctor
anvil inspect .
anvil clean .
anvil dashboard .
```

Replace the example directory with your actual project path.

### Build from source

For contributors or anyone who wants to work on ANVIL itself:

```bash
git clone https://github.com/anvil-workbench/ANVIL.git
cd ANVIL
npm ci
npm run typecheck
npm test
npm run build
```

## Features

ANVIL is composed of focused engineering systems that share local project context and persisted evidence.

### 1. Project and code intelligence

Understand a repository before asking an agent to change it.

- **Project inspection** — detect languages, frameworks, package managers, dependencies, scripts and project structure.
- **Code search** — search supported source files and inspect bounded matching context.
- **Architecture mapping** — map source modules, entry points and internal import relationships.
- **Dependency intelligence** — inspect npm dependency information, licenses and imported security reports.
- **Dependency impact** — identify downstream modules affected by a change.
- **Git intelligence** — analyze working-tree changes, changed files and suggested test targets.
- **Change intelligence** — combine changed-file context, dependency impact and engineering signals.
- **Engineering risk** — rank potential hotspots using dependency and quality evidence.
- **Project health** — produce a unified health snapshot with evidence coverage and quality signals.
- **Timeline snapshots** — capture and compare local engineering-intelligence snapshots.

### 2. Specialist agents and orchestration

Coordinate engineering tasks with explicit task state instead of relying on one long prompt.

- Built-in specialist-agent registry and workspace-defined agent roles.
- Workspace skill registry and skill selection.
- Project context assembly and local project memory.
- Declarative before-agent hooks and permission policies.
- Provider routing for configured AI backends.
- Dependency-aware review-plan generation.
- Saved runs, task-level status and approval checkpoints.
- Run replay for retryable failed tasks.
- Resume support for pending or approved work.
- Execution traces and per-agent telemetry.
- Configurable token and task-duration budgets.

Agent instructions and workspace files are treated as untrusted project content. A generated plan or response does not mean a project file has been changed.

### 3. Code review and patch lifecycle

Keep analysis, approval and file promotion as distinct operations.

- Static code review and evidence-backed findings.
- Optional provider-backed AI review suggestions.
- Saved review snapshots, review history and comparison.
- Patch validation as a dry run.
- Approval records tied to patch and source fingerprints.
- Staged patch review and staged verification workflows.
- Explicit operator-controlled promotion boundaries.

**A patch being suggested or validated is not the same as it being approved or applied.**

### 4. Verification and regression intelligence

Run checks deliberately and retain their outcomes.

- Discover available project checks without executing them.
- Run one explicitly selected verification script.
- Persist verification results and history.
- Compare verification history with current Git changes.
- Generate regression intelligence from verification and impact signals.
- Verify approved staged patches in a temporary workspace.
- Inspect Docker availability, security profiles and sandbox compliance.
- Review managed-container cleanup activity.

Local script verification runs project-controlled code on the host. Docker-backed verification is opt-in and depends on the host's Docker configuration.

### 5. Evaluation, benchmarking and improvement

Measure candidate configurations instead of silently changing agent behavior.

- Local evaluation suites and run scoring.
- Benchmark trials and benchmark matrices.
- Baseline-versus-candidate regression comparisons.
- Model and skill experiment scaffolding.
- Experiment manifests and experiment history.
- Agent effectiveness intelligence.
- Agent optimization recommendations.
- Controlled agent-evolution assessments.
- Agent/skill configuration snapshots and diffs.
- Benchmark-gated configuration release preparation and human approval.

Configuration promotion is reviewable. ANVIL does not silently rewrite its own agent or skill setup based on an evaluation result.

### 6. Security and policy

Security-related features focus on inspectable boundaries and bounded operations.

- Static agent-configuration audits for supported agent, skill, hook and permission files.
- Redaction of credential-like matches in audit output.
- Fail-closed permission-policy validation.
- Workspace path restrictions and symlink rejection in bounded readers.
- Patch/source fingerprint checks for approval records.
- Sandbox policy validation and compliance reporting.
- Explicit review of stopped ANVIL-managed containers before cleanup.

These controls reduce risk; they do not certify a repository or make arbitrary host execution safe.

## Dashboard

The **anvil dashboard** is a browser-based engineering control center served by the local CLI.

Start it from the project you want to inspect:

```bash
anvil dashboard .
```

The terminal prints a localhost URL. The dashboard reads the selected workspace and its local ANVIL records.

### Dashboard workspaces

| Area | What you can inspect or manage |
|---|---|
| **Overview** | Project summary, detected stack and workspace status |
| **Health** | Quality signals, health snapshots and engineering trends |
| **Architecture** | Project structure, module relationships and dependency views |
| **Agents** | Built-in and workspace specialist-agent registry |
| **Runs & tasks** | Saved orchestration runs, task states and execution details |
| **Approvals** | Human review and approval records |
| **Workflow editor** | Draft and save reusable specialist-agent workflows |
| **Configuration studio** | Workspace agent/skill Markdown, snapshots and configuration comparisons |
| **Workspace explorer** | Browse supported project files and inspect source |
| **Code search** | Search source and view bounded matching context |
| **Reviews** | Review findings, saved review snapshots and comparisons |
| **Verification** | Selected check results and verification history |
| **Traces** | Execution telemetry and per-agent activity |
| **Regression** | Compare verification outcomes and engineering signals |
| **Evaluations** | Evaluation suites, benchmark results and experiment comparisons |
| **Provider readiness** | Inspect provider configuration and run explicit connection diagnostics |

Some dashboard panels depend on local history, a configured provider or enabled workspace permissions.

### Public website vs local dashboard

These are two different experiences:

- **[ANVIL.vercel.app](https://ANVIL.vercel.app/)** is the public product website.
- **`anvil dashboard .`** starts the actual interactive dashboard on your machine and connects it to the selected local project.

The public website does not host your local project dashboard.

## CLI reference

Run `anvil --help` for the complete command list and `anvil <command> --help` for command-specific usage.

### Everyday project commands

| Command | Purpose |
|---|---|
| `anvil init [path]` | Create a local `.ANVIL` starter workspace |
| `anvil clean [path]` | Scan & scrub junk files, logs, temp downloads; add `--apply` to delete, `--fix` to repair code, `--verify` to run test gate |
| `anvil fix [path]` | Auto-repair code: prune unused imports, normalize whitespace and blank lines; add `--verify` |
| `anvil undo [path]` | Instant single-command rollback of last clean/fix operation using saved snapshot backup |
| `anvil hook install` | Install automated ANVIL quality gate into `.git/hooks/pre-commit` |
| `anvil inspect [path]` | Inspect project languages, tooling, dependencies and scripts |
| `anvil map [path]` | Map source modules and import relationships |
| `anvil dashboard [path]` | Start the local dashboard |
| `anvil quality [path]` | Generate a static engineering-quality report |
| `anvil deps [path]` | Analyze npm dependencies, licenses and imported security reports |
| `anvil health [path]` | Generate a unified project-health snapshot |
| `anvil deep [path]` | Analyze AST symbols, circular imports and change impact |
| `anvil git [path]` | Analyze changed files, impact and suggested tests |
| `anvil risk [path]` | Rank engineering hotspots |
| `anvil change-risk [path]` | Analyze changed-file risk and downstream impact |
| `anvil adr init [path]` | Initialize Architecture Decision Records directory (`docs/adr/`) with MADR template |
| `anvil adr new "Title" [path]` | Create a new MADR architectural decision record with status and context |
| `anvil adr list [path]` | List all architectural decision records and their current lifecycle statuses |
| `anvil adr sync [path]` | Sync project memory architectural decisions into versioned markdown ADRs |
| `anvil security [path]` | Deep scan for leaked credentials (OpenAI, Anthropic, GitHub, AWS, Google, Slack), dangerous scripts, exposed keys; add `--fix` to auto-exclude in `.gitignore` |
| `anvil snapshot [path]` | Capture an intelligence snapshot |
| `anvil timeline [path]` | Compare the latest intelligence snapshots |

### Agents and runs

| Command | Purpose |
|---|---|
| `anvil agents [path]` | List specialist-agent roles |
| `anvil skills [path]` | List built-in and workspace skills |
| `anvil hooks [path]` | List declarative lifecycle hooks |
| `anvil memory <action>` | Add, list, remove or inspect project memory |
| `anvil plan --goal TEXT` | Create and save a reviewable draft plan |
| `anvil run --goal TEXT` | Run a plan with the configured AI provider |
| `anvil runs [path]` | List saved local runs |
| `anvil show-run ID` | Display a saved run |
| `anvil approve RUN_ID TASK_ID` | Approve a task awaiting human review |
| `anvil resume RUN_ID` | Continue pending or approved tasks |
| `anvil replay RUN_ID` | Create a run from retryable failed tasks |
| `anvil trace RUN_ID` | Show per-agent execution telemetry |

### Review and verification

| Command | Purpose |
|---|---|
| `anvil review [path]` | Review changed source files |
| `anvil review [path] --ai` | Include provider-backed review suggestions |
| `anvil review-history [path]` | List saved review snapshots |
| `anvil review-show ID` | Display a saved review |
| `anvil review-compare A B` | Compare two saved reviews |
| `anvil patch-check ID N` | Dry-run validate a proposed patch |
| `anvil verify --list` | Discover available npm scripts without running them |
| `anvil verify SCRIPT` | Explicitly run one selected npm script |
| `anvil verify-history` | List saved verification runs |
| `anvil regression [path]` | Compare verification history with Git changes and impact |
| `anvil patch-verify ID SCRIPT` | Verify an approved staged patch in a temporary workspace |

### Evaluation and agent configuration

| Command | Purpose |
|---|---|
| `anvil evals [path]` | List local evaluation suites |
| `anvil evaluate RUN_ID` | Score a saved run against an evaluation suite |
| `anvil benchmark` | Record or view benchmark results |
| `anvil benchmark-matrix` | Run a configured model comparison matrix |
| `anvil benchmark-regression` | Compare a matrix with its baseline |
| `anvil optimize-agents` | Recommend evidence-based agent improvements |
| `anvil agent-intelligence` | Score agent effectiveness across benchmark history |
| `anvil agent-evolution` | Assess a controlled baseline/treatment experiment |
| `anvil experiment-studio` | Create or compare skill/model experiments |
| `anvil experiment-history` | Rank historical benchmark candidates |
| `anvil agent-config` | Snapshot, list, show and diff agent configuration |
| `anvil agent-release` | Prepare and review benchmark-gated configuration releases |
| `anvil experiment` | Capture, show and compare reproducible experiment manifests |

### Sandbox and diagnostics

| Command | Purpose |
|---|---|
| `anvil doctor [path]` | Environment health checks; add `--fix` to auto-scaffold missing config, .gitignore & .env |
| `anvil sandbox-status` | Inspect Docker availability and advertised security options |
| `anvil sandbox-compliance` | Generate a sandbox compliance report |
| `anvil sandbox-policy-check` | Validate a fail-closed sandbox policy |
| `anvil sandbox-profiles` | List or inspect built-in security profiles |
| `anvil sandbox-cleanup` | Review stopped ANVIL containers; `--apply` opts into removal |
| `anvil sandbox-cleanup-history` | Show recorded cleanup activity |
| `anvil agent-security [path]` | Audit supported agent instructions, skills, hooks and permissions |

Most project commands accept a project path. Use `--json` where supported for machine-readable output.

## AI providers

ANVIL supports provider adapters for local CLI and HTTP-based model services. Configure one provider using environment variables.

| Provider | Environment | Default model |
|---|---|---|
| Claude Code CLI | Authenticated Claude Code CLI on PATH | `sonnet` |
| OpenAI | `ANVIL_API_KEY` or `OPENAI_API_KEY` | `gpt-4.1-mini` |
| Anthropic API | `ANTHROPIC_API_KEY` | `claude-sonnet-4-5` |
| Google AI | `GOOGLE_API_KEY` | `gemini-2.5-flash` |
| Ollama | Local Ollama endpoint | `llama3.2` |

Set `ANVIL_AI_PROVIDER` to the provider name and optionally set `ANVIL_AI_MODEL` to override the model. `ANVIL_BASE_URL` selects a compatible gateway/custom endpoint. For Ollama, `OLLAMA_HOST` overrides the default local endpoint.

### Examples

```bash
# OpenAI
ANVIL_AI_PROVIDER=openai OPENAI_API_KEY=YOUR_KEY anvil run --goal "Review the authentication flow" --path .

# Anthropic
ANVIL_AI_PROVIDER=anthropic ANTHROPIC_API_KEY=YOUR_KEY anvil run --goal "Map the service boundaries" --path .

# Google Gemini
ANVIL_AI_PROVIDER=google GOOGLE_API_KEY=YOUR_KEY anvil run --goal "Identify reliability risks" --path .

# Local Ollama
ANVIL_AI_PROVIDER=ollama OLLAMA_HOST=http://localhost:11434 ANVIL_AI_MODEL=llama3.2 anvil run --goal "Explain the architecture" --path .

# Claude Code CLI
ANVIL_AI_PROVIDER=claude-code ANVIL_AI_MODEL=sonnet anvil run --goal "Plan a safe refactor" --path .
```

> [!IMPORTANT]
> Provider calls may send task prompts, dependency results and selected project context to the configured service. Hosted API use may incur charges. A consumer chat subscription does not automatically include API credits. Review [provider configuration and data-handling notes](docs/providers.md) before using private repositories.

### Provider connection diagnostics

The local dashboard includes explicit connection checks for OpenAI, Anthropic, Google and Ollama. These checks make a read-only model-list request; they do not submit a generation prompt. A successful connection check does not guarantee generation access to every model.

## Integrations

### Claude Code

ANVIL includes a local Claude Code CLI provider adapter. It uses the CLI installed and authenticated on the developer's machine; it is not the same as configuring an Anthropic API key.

See [Claude Code integration](docs/integrations/claude-code.md).

### Cursor and MCP

Cursor can connect to ANVIL through the local stdio MCP server using Cursor's MCP configuration. This is **MCP interoperability**, not a native Cursor extension.

Example project configuration:

```json
{
  "mcpServers": {
    "ANVIL": {
      "command": "node",
      "args": ["C:/path/to/ANVIL/dist/mcp/server.js"],
      "env": {
        "ANVIL_WORKSPACE": "C:/path/to/your-project"
      }
    }
  }
}
```

Build ANVIL before using the compiled server:

```bash
npm run build
```

Adjust the paths for your machine. See [Cursor MCP documentation](https://docs.cursor.com/context/mcp).

### MCP server

ANVIL provides a Model Context Protocol server over stdio:

```bash
npm run build
ANVIL_WORKSPACE=/absolute/path/to/project npm run mcp
```

The current MCP server exposes bounded, read-only tools:

| Tool | Function |
|---|---|
| `anvil_inspect_project` | Inspect project structure and tooling |
| `anvil_map_architecture` | Map source files and imports |
| `anvil_search_code` | Search supported project source |
| `anvil_list_files` | List supported workspace files |
| `anvil_read_file` | Read a bounded text/source file |
| `anvil_quality_audit` | Run static project-quality checks |
| `anvil_git_intelligence` | Analyze Git changes and impact |
| `anvil_list_agents` | List built-in and workspace agent roles |
| `anvil_create_review_plan` | Create a draft engineering review plan |
| `anvil_agent_intelligence` | Score agent performance from benchmark history |
| `anvil_project_health` | Unified health snapshot & telemetry |
| `anvil_change_risk` | Risk analysis for pending changes |
| `anvil_dependency_impact` | Dependency blast radius & impact analysis |
| `anvil_security_audit` | Scan secrets, tokens, and script risks |

MCP workspace paths are constrained to the configured workspace root. Hidden paths, generated/dependency directories, secret-like filenames and symlinks are excluded or rejected. Reads are bounded. The MCP server does not expose arbitrary shell execution, project-file writes, patch application or test execution.

Some workspace browsing/search operations require an explicit restricted-mode allowlist in `.anvil/permissions.json`; the default proposal-only policy denies them.

### GitHub Action

ANVIL ships a composite GitHub Action for selected CI operations.

```yaml
name: ANVIL checks

on:
  pull_request:
  push:
    branches: [main]

jobs:
  ANVIL:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: anvil-workbench/ANVIL@v1.0.9
        with:
          version: v1.0.9
          project-path: .
          operation: gate
```

Supported `operation` values:

| Operation | What it runs |
|---|---|
| `inspect` | Project inspection |
| `quality` | Static engineering-quality audit |
| `health` | Project-health report |
| `review` | Code review |

Inputs are `version`, `project-path` and `operation`. The default operation is `inspect`. Pin production workflows to a reviewed release tag or immutable commit SHA. See [action.yml](action.yml).

### GitHub App

[**Get the ANVIL GitHub App →**](https://ANVIL.vercel.app/api/github/install)

The GitHub App currently provides an installation entry point, signed installation webhooks, OAuth account authorization, verified installation association and server-side session handling.

**Not shipped yet:** hosted repository-content scanning, installation-token-based repository workflows, automatic pull-request creation and hosted autonomous coding agents. Installing the App does not upload or scan a local workspace. Use the local CLI/dashboard for repository analysis today.

See [GitHub App integration notes](docs/integrations/github-app.md) for endpoints, settings and security details.

## Architecture

ANVIL is a TypeScript/Node.js application with a CLI entry point and focused core modules.

```text
                         Developer / CI
                               |
              +----------------+----------------+
              |                |                |
          ANVIL CLI        GitHub Action     MCP clients
          src/cli.ts         action.yml     stdio transport
              |                |                |
              +----------------+----------------+
                               |
                     ANVIL Core Engine
                               |
      +----------------+------+-------+----------------+
      |                |              |                |
  Intelligence      Agents &       Review &        Evaluation &
  & Analysis       Orchestration   Verification     Experimentation
      |                |              |                |
      +----------------+------+-------+----------------+
                               |
                   Local workspace state
                         .ANVIL/
                               |
                    Local Dashboard UI
                 src/core/dashboard-server.ts
```

### Repository layout

```text
ANVIL/
├── .ANVIL/                 # Built-in evaluation data
├── .github/workflows/      # CI, release and sandbox workflows
├── api/
│   ├── _lib/               # GitHub App, OAuth and storage helpers
│   └── github/             # Install, auth, setup and webhook endpoints
├── docs/
│   ├── integrations/       # Claude Code and GitHub App guides
│   ├── providers.md        # Provider setup and diagnostics
│   └── ANVIL-CAPABILITY-ROADMAP.md
├── public/
│   ├── index.html          # Public product website
│   └── *.svg               # ANVIL brand artwork
├── src/
│   ├── ai/                 # Provider adapters
│   ├── core/               # Engineering workbench modules
│   ├── mcp/                # MCP server and workspace path policy
│   └── cli.ts              # CLI entry point
├── tests/                  # Unit and integration tests
├── action.yml              # Reusable GitHub composite Action
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
├── package.json
├── README.md
└── SECURITY.md
```

### Core module map

| Module group | Responsibilities |
|---|---|
| Project intelligence | Inspection, code search, architecture maps, dependency graphs and impact |
| Quality and risk | Quality audits, health snapshots, engineering risk and change intelligence |
| Agent system | Agent registry, workspace context, skills, hooks, model routing and orchestration |
| Run lifecycle | Run persistence, task settlement, approvals, replay, resume and traces |
| Review lifecycle | Static/AI review, review history, patch validation, approval and staging |
| Verification | Script discovery, explicit verification, staged verification and history |
| Sandbox | Container runtime, security profiles, policy, compliance and cleanup audit |
| Evaluation | Evaluation suites, benchmarks, matrices, regression and experiment history |
| Agent improvement | Optimization plans, config snapshots, evolution and release gates |
| Workspace interface | Local dashboard, workspace browser and bounded MCP tools |

## Security model

ANVIL is designed to keep consequential operations explicit and inspectable.

- **Local-first by default:** the dashboard runs on loopback and reads the workspace selected by the CLI.
- **Bounded workspace access:** path resolution rejects traversal and symlinks; readers exclude hidden, generated, dependency and secret-like paths.
- **Read-only MCP tools:** the MCP server does not expose arbitrary shell execution or workspace writes.
- **Fail-closed policies:** malformed or unsupported permission policies are not treated as permission grants.
- **Review before promotion:** patch validation is a dry run; approval records bind to patch and source fingerprints; staging is separate from promotion.
- **Explicit verification:** the operator chooses which named check to run.
- **Redacted audit output:** credential-like matches are redacted by the static agent-configuration audit.
- **Opt-in Docker workflows:** Docker-backed verification and cleanup operations are separate and require explicit operator action.

> [!WARNING]
> ANVIL is an early-stage engineering tool. Local script verification executes project-controlled code on the host; it is **not** an OS sandbox. Docker security depends on the host runtime and selected configuration. Static audits and heuristic risk scores are not security certifications. AI review may send selected source excerpts to the provider you configure.

Read [SECURITY.md](SECURITY.md) before using ANVIL with untrusted repositories, agent instructions or project scripts.

## Current capabilities and boundaries

The v1.0 release establishes the local engineering workbench foundation.

| Area | v1.0 status |
|---|---|
| CLI and local workspace | Available |
| Interactive local dashboard | Available |
| Project/code/dependency intelligence | Available |
| Agent registry, skills, hooks and orchestration | Available |
| Review, patch validation and approval records | Available |
| Verification, regression and history | Available |
| Evaluation, benchmark and experiment workflows | Available |
| MCP server with bounded read-only tools | Available |
| Claude Code CLI provider adapter | Available |
| OpenAI, Anthropic, Google and Ollama adapters | Available |
| GitHub composite Action | Available |
| GitHub App installation and OAuth foundation | Available |
| Hosted repository scanning through the GitHub App | Not implemented |
| Hosted automatic pull-request creation | Not implemented |
| Hosted autonomous coding agents | Not implemented |
| Native Cursor/VS Code IDE extension | Not shipped |
| Hosted multi-user dashboard | Not shipped |

This table is intentional: a roadmap item is not a shipped feature. The project tracks planned work in the [ANVIL Capability Roadmap](docs/ANVIL-CAPABILITY-ROADMAP.md).

## Roadmap

ANVIL's direction is to grow into a complete, local-first agent engineering harness while preserving clear permission boundaries.

- **Agent and skill ecosystem:** expand specialist roles, skill packs, compatibility metadata and lifecycle management.
- **Memory and context:** structured memory layers with provenance, retrieval and retention controls.
- **Hooks and policy:** more lifecycle events, deterministic policy evaluation and auditable presets.
- **Planning and execution:** reusable workflows, checkpoints, cancellation and durable recovery.
- **Quality and verification:** independent review passes, verification profiles and evidence-linked reports.
- **Security:** broader configuration scanning, supply-chain checks and posture reports.
- **Integrations:** stable adapter interfaces and a truthful harness compatibility matrix.
- **Learning loop:** evidence-based lessons and regression-gated, human-approved configuration releases.
- **Operator experience:** unified setup/doctor/status commands, export/import and migration tools.

See [docs/ANVIL-CAPABILITY-ROADMAP.md](docs/ANVIL-CAPABILITY-ROADMAP.md) for the detailed delivery sequence and non-negotiable product rules.

## Development

### Clone and install

```bash
git clone https://github.com/anvil-workbench/ANVIL.git
cd ANVIL
npm ci
```

### Quality checks

```bash
npm run typecheck
npm test
npm run build
```

### npm scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Run the TypeScript CLI during development |
| `npm run build` | Compile TypeScript into `dist/` |
| `npm run typecheck` | Type-check without emitting files |
| `npm test` | Run the Vitest test suite |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run mcp` | Start the built MCP server |

### Contributing

1. Open an issue to discuss substantial changes.
2. Keep pull requests focused and explain the user problem.
3. Add or update tests for behavior changes.
4. Document permission and security implications.
5. Never commit credentials, tokens, private keys or local workspace data.
6. Run type checking, tests and the production build before submitting.

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Project history

ANVIL's v1.0.7 release introduces an integrated Architecture Decision Records (ADR) Engine (`anvil adr init/new/list/sync` with MADR standard and project memory sync), a comprehensive Security & Secret Scanner (`anvil security [--fix] [--json]` detecting exposed OpenAI, Anthropic, GitHub, AWS, Google, and Slack tokens, private keys, and risky scripts with automated `.gitignore` remediation), and a real-time Interactive Live DAG Workflow Runner in the local dashboard with Server-Sent Events (SSE) streaming and live task state visual animations.

ANVIL's v1.0.6 release introduced an automated AI harness MCP setup wizard (`anvil mcp setup --client cursor|claude|windsurf|all`), a durable Project Memory & Architectural Decisions hub (`anvil memory` and live dashboard panel), dual-path memory retention (`.anvil/memory.json` / `.forge/memory.json`), seamless single-page dashboard execution, rich pre-populated showcase telemetry, automatic port fallback (`4173..4183`), single-command byte-accurate rollback (`anvil undo`), automated test verification gate (`--verify`), Git pre-commit hook automation (`anvil hook install`), framework-aware entrypoint resolution, full multi-language architecture mapping, automated clutter scrubbing, code auto-repair, one-command doctor self-healing, the local CLI, engineering intelligence, agent workflows, MCP integration, GitHub Action and GitHub App installation foundation into one versioned product.

### Provenance & Architectural Origin

ANVIL is an independent, original implementation created and maintained by Aditya Tiwari under the permissive MIT license.
- **Architectural Reference:** ANVIL draws inspiration from patterns in the Everything-Claude-Code (ECC) ecosystem and modern local-first developer harnesses.
- **Independent Codebase:** Every line of TypeScript, AST parser, DAG workflow engine, SARIF generator, and MCP integration is independently authored and maintained with dedicated test suites.
- **No Upstream License Baggage:** ANVIL contains zero proprietary dependencies or borrowed non-permissive code.

The project is maintained as an original ANVIL codebase. ECC is a capability and documentation reference; ANVIL maintains its own identity, implementation, data models and roadmap.

For release-by-release changes, see [CHANGELOG.md](CHANGELOG.md).

## Project links

| Resource | Link |
|---|---|
| Product website | [ANVIL.vercel.app](https://ANVIL.vercel.app/) |
| Get the GitHub App | [Install ANVIL](https://ANVIL.vercel.app/api/github/install) |
| Source repository | [anvil-workbench/ANVIL](https://github.com/anvil-workbench/ANVIL) |
| Organization | [ANVIL WORKBENCH](https://github.com/anvil-workbench) |
| Releases | [GitHub Releases](https://github.com/anvil-workbench/ANVIL/releases) |
| Issues and bugs | [GitHub Issues](https://github.com/anvil-workbench/ANVIL/issues) |
| CI and automation | [GitHub Actions](https://github.com/anvil-workbench/ANVIL/actions) |
| Roadmap | [Capability Roadmap](docs/ANVIL-CAPABILITY-ROADMAP.md) |
| Changelog | [CHANGELOG.md](CHANGELOG.md) |
| Provider guide | [docs/providers.md](docs/providers.md) |
| GitHub App guide | [GitHub App integration](docs/integrations/github-app.md) |
| Security policy | [SECURITY.md](SECURITY.md) |
| Contributing | [CONTRIBUTING.md](CONTRIBUTING.md) |

## Support

For questions about ANVIL or help with the GitHub App, contact [m.g.atiwari28@gmail.com](mailto:m.g.atiwari28@gmail.com).

## Maintainer

**Aditya Tiwari** · [@AdityaaaTiwari](https://github.com/AdityaaaTiwari)

## License

ANVIL is open source under the [MIT License](LICENSE).

## Star history

<p align="center">
  <a href="https://www.star-history.com/anvil-workbench/ANVIL">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=anvil-workbench/ANVIL&type=Date&theme=dark" />
      <img src="https://api.star-history.com/svg?repos=anvil-workbench/ANVIL&type=Date" alt="ANVIL GitHub star history" width="100%" />
    </picture>
  </a>
</p>

