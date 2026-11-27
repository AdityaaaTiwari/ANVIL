# ANVIL Documentation Index

Welcome to the ANVIL documentation. ANVIL is the deterministic **verification layer** for AI coding agents. Any agent — Claude Code, Codex, Cursor, Antigravity, OpenCode — writes the code; ANVIL verifies it locally before it merges.

---

## 🚀 Getting Started
- [Universal AI Tool Installer](install.md) — Connect ANVIL to Claude Code, Cursor, Copilot, Antigravity, Windsurf, Codex, Gemini in one command.
- [Agent Stop Hooks](agent-hooks.md) — Automatically gate agent changes on finish with Claude Code and Cursor (`anvil install --hooks`).
- [Getting Started Guide](getting-started.md) — 60-second quick start, installation, everyday CLI commands, and pre-commit hook setup.
- [Model Context Protocol (MCP) Server](mcp-server.md) — Connect ANVIL's local deterministic tools to any MCP-compliant AI client.
- [Agent Guidelines (AGENTS.md)](../AGENTS.md) — Standard operating rules for AI coding assistants working in ANVIL repositories.

---

## 🔌 Agent Integrations
- [Claude Code Integration](integrations/claude-code.md) — Using ANVIL MCP tools with Claude Code and proposal-only provider adapter.
- [Antigravity Integration](integrations/antigravity.md) — MCP configuration, exact config file paths, and workflow guide for Google Antigravity.
- [GitHub App Integration](integrations/github-app.md) — GitHub App setup, webhooks, and repository access.

---

## 🛡️ Policy, Verification & CI/CD
- [Unified Multi-Cockpit Dashboard](unified-dashboard-architecture.md) — Unified control center combining Verification Gate, Agent Toolkit, Binary Intelligence, and Control Center Scorecard/Benchmarks.
- [Policy as Code](policy-as-code.md) — Declare governance, security thresholds, and sandbox execution limits in `.anvil/policy.json`.
- [CI Quality Gate & SARIF Integration](ci-gate-and-sarif.md) — Running `anvil gate` in GitHub Actions, PR diff mode, SARIF export/import, and baseline snapshots.
- [Policy Schema](anvil-policy.schema.json) — JSON schema definition for ANVIL policy configurations.

---

## 🔒 Security & Analysis
- [Security Model](security-model.md) — Local-first boundaries, read-only MCP guarantees, and execution isolation.
- [AI Agent Security Audit](agent-security.md) — Deep audit of agent configs, prompt injection, hidden Unicode, MCP secrets, and tool permissions.
- [False Positive Analysis](false-positive-analysis.md) — Heuristic precision, suppression mechanisms, and validation methodology.
- [Rule Confidence Catalog](rule-confidence-catalog.md) — Comprehensive catalog of security and quality inspection rules and their confidence ratings.
- [Token Benchmark Results](token-benchmark-results.md) — Empirical benchmarks demonstrating 96–99% token reductions using compact deterministic payloads.

---

## 🗺️ Reference & Developer Notes
- [Capability Roadmap](ANVIL-CAPABILITY-ROADMAP.md) — Architectural roadmap, upcoming features, and development milestones.
- [Provider Abstraction](providers.md) — Documentation of the AI provider subsystem.
- [Architecture Notes](architecture-notes.md) — Positioning, architecture principles and guardrails for contributors and coding agents.
