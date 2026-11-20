# ANVIL Changelog

## 1.0.3 — CLI Help, Usage & Output Brand Unification

ANVIL 1.0.3 unifies all CLI help examples, usage instructions, error messages, and dashboard startup telemetry under the official `anvil` command.

### Changes
- Updated all CLI command examples in `--help` from `forge` to `anvil`.
- Aligned starter workspace initialization to `.anvil`.
- Updated CLI version output to `anvil 1.0.3`.
- Updated all command usage strings, diagnostics, and dashboard startup messages to `ANVIL`.
- Updated test suite assertions to verify `anvil` CLI help output.

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
