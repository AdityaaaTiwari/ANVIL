# ANVIL Capability Roadmap

ANVIL is an independent, local-first AI engineering harness for software developers.

## Product direction

Build an original, local-first agent engineering harness with ANVIL-owned interfaces, data models, runtime, CLI, documentation, tests, and visual identity. Preserve clear permission boundaries and keep consequential actions under reviewable human approval.

## Capability map

| Capability area | ANVIL foundation today | ANVIL direction |
| --- | --- | --- |
| Agents and specialist roles | Agent registry, orchestration, provider adapters | Expand role catalog, agent contracts, task routing, delegation and agent lifecycle |
| Skills and workflows | Skill registry, workspace Markdown skills, skill selection | Versioned skill packs, nested SKILL.md support, metadata validation, compatibility checks, install/update/list commands |
| Memory and context | Project memory, task context builder | Structured memory layers, retrieval, provenance, retention controls, secret/PII safeguards |
| Hooks and policies | Declarative before-agent hooks, permission policy | More lifecycle events, deterministic policy evaluation, audit logs and safe presets |
| Planning and execution | Dependency-aware run orchestration, approvals, resume | Reusable workflow templates, checkpoints, cancellation, durable per-task settlement and recovery |
| Quality and verification | Code review, quality audit, verification, regression intelligence | TDD workflows, independent review passes, verification profiles and evidence-linked reports |
| Security | Permission policy, sandbox policy, container sandbox, security review | Agent configuration scanning, prompt/config risk checks, supply-chain checks and security posture reports |
| Research and documentation | Code search, project inspection, dependency intelligence | Research-first workflows, source-backed technical research, docs lookup and architecture decision records |
| Integrations and harnesses | MCP server, provider adapters, CLI | Stable integration SDK and adapters for supported coding harnesses; publish a truthful support matrix |
| Learning and improvement | Evaluations, benchmarks, experiments, optimization recommendations | Evidence-based learning loop, reusable lessons, regression gates and human-approved config releases |
| Operator experience | CLI, local dashboard, traces and run history | Unified setup/doctor/status UX, inspectable activity timeline, export/import and migration tools |

## Delivery sequence

### Phase 1 — Foundation and compatibility
- Define stable schemas for agents, skills, hooks, memory, policies and workflow manifests.
- Make skill loading support both simple workspace Markdown files and nested SKILL.md packages.
- Add catalog validation, deterministic discovery, provenance and compatibility metadata.
- Add CLI commands for listing, validating and inspecting installed capabilities.
- Add fixtures and tests for malformed metadata, path traversal, symlinks and conflicting IDs.

### Phase 2 — Agent operating system
- Expand specialist agents and routing rules.
- Add reusable planning, implementation, review, verification and research workflows.
- Persist task-level outcomes as each task settles so interrupted batches lose less completed work.
- Add clear human approval gates for consequential actions.

### Phase 3 — Memory, hooks and security
- Add lifecycle hooks with fail-closed policy behavior.
- Add layered, searchable project memory with provenance and safe retention.
- Add security auditing for agent/skill/hook/MCP configuration and secrets exposure.
- Keep execution permissions narrower than descriptive agent instructions.

### Phase 4 — Integrations and operator UX
- Architecture Decision Records (ADR Engine): Markdown MADR 3.0 standard (`docs/adr/`), CLI `anvil adr (init/new/list/sync)`, automated memory sync, and interactive visual ADR viewer/creator in dashboard (Shipped in v1.0.7).
- Deep Security & Secret Scanner: Automated scanning for API keys (OpenAI, Anthropic, GitHub, AWS, Google, Slack), private keys, curl-pipe-bash vulnerabilities, unignored credentials, and one-click `--fix` auto-remediation (Shipped in v1.0.7).
- Interactive Live DAG Workflow Runner: Real-time visual canvas with live SSE execution stream, task state animations, and simulated multi-agent step settlement via DemoAgentProvider (Shipped in v1.0.7).
- Add supported harness adapters behind stable interfaces (Claude Code, Cursor, Windsurf via Model Context Protocol) (Shipped in v1.0.6 via anvil mcp setup).
- Project Memory & Architectural Decisions Hub: Dual-path retention (.anvil/memory.json), token-budgeted context ranking, and dashboard memory hub (Shipped in v1.0.6).
- Doctor & Project Health wizard: `anvil doctor` system diagnostics and `anvil doctor --fix` automated environment scaffolding (Shipped in v1.0.3).
- Polyglot Architecture & Cleaner Engine: Multi-language dependency mapping (Python, Rust, Go, Java, C/C++, TS), workspace junk pruning, and automated code cleanup (`anvil clean`, `anvil fix`) (Shipped in v1.0.3).
- Zero-Fear Rollback & Self-Healing Loop: Instant byte-accurate snapshot restoration (`anvil undo`), automated test verification gate (`--verify`), pre-commit Git hook automation (`anvil hook install`), and framework-aware entrypoint manifests for Next.js, Django, Rust, and Go (Shipped in v1.0.4).
- Real-time engineering dashboard with live architectural metrics, system health, quality audits, agent intelligence, showcase telemetry mode, and self-healing cleaner hub (Shipped in v1.0.5).

## Non-negotiables

- Verification precedes claims. Do not claim a capability works without an automated test or executable verification run.
- Keep consequential mutations reviewable. Avoid silent rewriting of agent definitions, instructions, or configuration without human promotion.
- Maintain a local-first architecture. The local dashboard and CLI run against local workspaces without requiring cloud telemetry.
- Permissions remain bounded. Do not weaken permission checks or provide unfettered access across security boundaries.
