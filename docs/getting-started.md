# Getting Started with ANVIL

ANVIL is the deterministic **verification layer** for AI coding agents. Any agent — Claude Code, Codex, Cursor, Antigravity, OpenCode — writes the code; ANVIL verifies it locally before it merges.

This guide walks you through installing ANVIL, running project inspections and quality gates, configuring MCP for your AI agents, and setting up automated CI/CD verification.

---

## Prerequisites

- **Node.js**: v22.0.0 or higher (`node -v`)
- **Git**: v2.30.0 or higher (`git --version`)
- **Operating System**: macOS, Linux, or Windows (WSL and native PowerShell supported)

---

## 1. Quick Verification (No Install Required)

You can run ANVIL directly in any repository using `npx`:

```bash
# Run the pre-commit policy & security gate
npx -y anvil-engineering-workbench@1.4.0 gate

# Inspect project stack, languages, and build scripts
npx -y anvil-engineering-workbench@1.4.0 inspect
```

---

## 2. Global Installation

Install ANVIL globally via npm:

```bash
npm install -g anvil-engineering-workbench
```

Verify your installation:

```bash
anvil --version
anvil doctor
```

`anvil doctor` verifies your local environment, Node.js runtime, Git version, container daemon (if present), and file permissions.

---

## 3. Initializing a Repository

In your project root, run:

```bash
anvil init
```

This creates a local `.anvil/` directory with:
- `.anvil/baseline.json`: Content-hashed baseline snapshot of existing issues (so legacy projects don't fail CI immediately).
- `.anvil/policy.json`: Policy-as-code configuration defining security limits, allowed tools, and gate rules.

---

## 4. Everyday CLI Workflows

### Project Inspection & Tech Stack Detection
```bash
anvil inspect
```
Detects primary/secondary languages, package managers (npm, pnpm, yarn, cargo, poetry), test runners (Vitest, Jest, pytest), and build scripts.

### Architecture Mapping
```bash
# Map multi-language import graph and circular dependency rings
anvil map

# Deep AST symbol analysis
anvil map --deep
```

### Change Risk & Blast Radius
```bash
# Evaluate risk of uncommitted working-tree changes
anvil git

# Compare against a base branch
anvil git origin/main
```
Identifies downstream modules impacted by your changes and suggests specific test files to run.

### Transactional Workspace Cleanup
```bash
# Dry-run scan for caches, build junk, and orphan source files
anvil clean --dry-run

# Safely clean with an atomic snapshot backup
anvil clean --fix

# Revert anytime using the backup ID printed by clean
anvil clean --undo <backupId>
```

### Pre-Commit Quality & Security Gate
```bash
# Run full gate against policy and baseline
anvil gate --baseline .anvil/baseline.json

# Check only files changed since a git ref (PR mode)
anvil gate --since origin/main

# Output standard SARIF report
anvil gate --sarif gate.sarif
```

---

## 5. Install Git Pre-Commit Hook

Ensure no broken architecture or secrets get committed:

```bash
anvil hook install
```

To remove the hook at any time:
```bash
anvil hook remove
```

---

## 6. Connect to Your AI Coding Agents (MCP)

ANVIL includes a zero-cloud Model Context Protocol (MCP) server that provides 16+ deterministic tools to your agents.

### Automatic Wizard
```bash
# Auto-configure all detected AI clients (Cursor, VS Code, Windsurf) and display Claude Code command
anvil mcp setup
```

### Manual Configuration
- **Claude Code**:
  ```bash
  claude mcp add anvil -- npx -y anvil-engineering-workbench mcp start
  ```
- **Cursor** (`.cursor/mcp.json`):
  ```json
  {
    "mcpServers": {
      "anvil": {
        "command": "npx",
        "args": ["-y", "anvil-engineering-workbench", "mcp", "start"]
      }
    }
  }
  ```
- **Antigravity**:
  See our dedicated [Antigravity Integration Guide](integrations/antigravity.md).

---

## 7. Automated PR Gate in GitHub Actions

Add `.github/workflows/anvil-gate.yml` to your repository:

```yaml
name: ANVIL Verification Gate
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
      pull-requests: write
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
        with:
          fetch-depth: 0

      - uses: actions/setup-node@39370e3970a6d050c480ffad4ff0ed4d3fdee5af # v4.1.0
        with:
          node-version: 22

      - name: Run ANVIL Verification Gate
        uses: AdityaaaTiwari/ANVIL@v1.4.0
        with:
          since: origin/${{ github.base_ref || 'main' }}
          sarif: anvil-gate.sarif
          pr-comment: "true"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload SARIF to GitHub Code Scanning
        uses: github/codeql-action/upload-sarif@48ab28a6f5dab2a823c7a4007679df8b12c38da7 # v3.28.0
        if: always()
        with:
          sarif_file: anvil-gate.sarif
```

---

## Next Steps

- Explore the [MCP Server Documentation](mcp-server.md) for tool schema and token estimation details.
- Learn about [Policy as Code](policy-as-code.md) to customize gate thresholds for your team.
- Read [CI Gate & SARIF Integration](ci-gate-and-sarif.md) for advanced CI workflows.
