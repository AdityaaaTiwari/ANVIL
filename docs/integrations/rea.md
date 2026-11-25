# REA (Reverse Engineer Anything) Integration

This guide outlines how to use **`morluto/rea`** alongside **ANVIL** to create a secure, evidence-based **Clean-Room Reverse-Engineering Pipeline** for AI coding assistants (Claude Code, Cursor, Codex, Antigravity).

---

## Overview: Inspection Meets Verification

- **`morluto/rea`** provides the **Black-Box & Binary Inspection Layer**: An MCP server and CLI that allows coding agents to inspect, decompile, and analyze native binaries (`.dll`, `.so`, `.exe`), Electron/web source maps, Android APKs, and network API captures (`.har`) without requiring original source code.
- **ANVIL** provides the **Deterministic Verification Layer**: Local AST import mapping, blast radius analysis, secret scanning, and automated stop hooks. It ensures that any reverse-engineered polyfills, clean-room reimplementations, or patches are safe, regression-free, and comply with CI policies.

```text
┌────────────────────────────────────────────────────────────────────────┐
│               CLEAN-ROOM REVERSE-ENGINEERING PIPELINE                  │
└────────────────────────────────────────────────────────────────────────┘

 [1. REA (morluto/rea)]
      Inspection Layer ───> Agent inspects compiled binary / minified bundle / APK.
                            Produces structured evidence of exports and behavior.
                                        │
                                        ▼
 [2. AI CODING AGENT]
      Reengineering    ───> Authors a clean-room, idiomatic implementation or
                            compatibility polyfill in TypeScript / Python / Go.
                                        │
                                        ▼
 [3. ANVIL Verification]
      Safety & Gate    ───> • `anvil gate --diff`: Verifies no hardcoded secrets or leaks
                            • `anvil_change_risk`: Validates downstream consumer impact
                            • Stop Hook: Auto-intercepts on completion for self-healing
```

---

## ⚡ Quick Start: Configuring REA and ANVIL Together

Both ANVIL and REA run as Model Context Protocol (MCP) servers and operate in complete harmony within the same workspace.

### 1. Register ANVIL with Stop Hooks
```bash
npx -y anvil-engineering-workbench install . --hooks
```

### 2. Configure REA MCP Server
Install and setup REA for your AI assistant:
```bash
npx rea-agents setup
```

### 3. Verify Coexistence in `.mcp.json`
Your project's `.mcp.json` (or `.cursor/mcp.json`) will cleanly declare both tools:

```json
{
  "mcpServers": {
    "anvil": {
      "command": "npx",
      "args": ["-y", "anvil-engineering-workbench", "mcp", "start"]
    },
    "rea": {
      "command": "npx",
      "args": ["-y", "rea-agents", "mcp"]
    }
  }
}
```

---

## 🛠️ The Clean-Room Reengineering Workflow

When replacing a closed-source dependency or debugging an undocumented API:

### Step 1: Deconstruct & Gather Evidence (REA)
Ask your coding agent to inspect the target binary, source map, or network capture using REA tools:
- `rea_decompile`: Decompile native functions or parse minified bundle structures.
- `rea_extract_symbols`: Extract exported symbols, struct definitions, and interfaces.
- `rea_inspect_ipc`: Trace IPC messages in Electron applications.

The agent records its findings as structured evidence.

### Step 2: Author Clean-Room Code
The agent writes a replacement module, wrapper, or polyfill in your project's native language. 
- The implementation is authored cleanly from behavioral specifications and interfaces.
- Proprietary decompiled code and binary blobs are **never** committed directly.

### Step 3: Local Verification & Blast Radius (ANVIL)
Before declaring the task complete:
1. **Check Downstream Impact:**
   ```bash
   anvil git .
   ```
   ANVIL calculates which internal modules consume the new implementation and identifies which test files must be executed.

2. **Verify Security & Gate Compliance:**
   ```bash
   anvil gate . --diff
   ```
   Ensures that:
   - No sensitive API keys or connection strings extracted during reverse engineering were left in source code (`ANVIL-AGENT-103`).
   - No dangerous dynamic evaluation was introduced (`ANVIL-R001` `eval()`).
   - All tests and project lint policies are satisfied.

3. **Stop Hook Safety Net:**
   If the agent attempts to stop while gate violations exist, ANVIL's stop hook intercepts the finish event and directs the agent to fix the issues autonomously.

---

## 🔒 Security & Intellectual Property Protections

- **Zero Network Transmission:** Both ANVIL and REA local analysis operate entirely on your workstation without transmitting proprietary binaries or source code to third-party services.
- **Secret Redaction:** ANVIL's secret scanner automatically flags credentials or private keys discovered during decompilation if they appear in source commits.
- **SARIF Auditing:** Gate reports can be exported to SARIF (`anvil gate --sarif rea-audit.sarif`) to verify compliance in automated pull request pipelines.

---

## 🧪 Python REA Bridge Test Suite

ANVIL bundles and executes the Python bridge unit tests under `catalog/rea/bridges/` alongside TypeScript Vitest tests:

```bash
npm run test:rea
```

- Runs `scripts/run-rea-bridge-tests.mjs` -> `scripts/run-rea-bridge-tests.py`, synthesizing in-memory `bridge` packages over `catalog/rea/bridges/` and running all `10` `test_*.py` suites (`103` tests) via stdlib `unittest`.
- On Linux and macOS CI runners (`.github/workflows/ci.yml`), all `10` suites run with `--require-posix`. On Windows hosts, POSIX-only suites/tests (`pwndbg/test_core_context.py`, `agentenv/test_solve_cleanup.py`, and Unix `os.mkfifo` tests in `native/test_rea_lldb_tracer.py`) are cleanly skipped while portable suites execute normally.
