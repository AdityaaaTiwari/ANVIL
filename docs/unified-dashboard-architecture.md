# Unified Multi-Cockpit Dashboard Architecture

ANVIL provides a unified engineering control center that combines **Verification (ANVIL)**, **Agent Skills (ECC)**, **Binary Reverse-Engineering (REA)**, and **Control Center & Harness Scorecard** workflows into one cohesive cockpit with dedicated domain-specific views.

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                    UNIFIED WORKBENCH COCKPIT (SEPARATE YET COMBINED)                   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [ 🌐 Combined ]  [ 🛡️ ANVIL Gate ]  [ 🧠 ECC Skills ]  [ 🔍 REA ]  [ ⚡ Control Center ] │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 The Philosophy: "Separate Dashboards, Combined Experience"

Modern AI-assisted software engineering involves multiple specialized domains:
1. **Verification & CI Governance:** Static policies, AST blast radius, secret detection, and pre-commit checks.
2. **Knowledge & Skills:** Domain-specific prompt rules, lifecycle stages, and engineering instincts.
3. **Deep Binary Analysis:** Decompiled native libraries, source maps, and network API traffic.
4. **Agent Intelligence & Benchmarks:** Multi-agent evaluation scorecards and execution traces.

Mixing all of these into a single cluttered screen causes information overload, while running four separate tools creates painful context switching.

**The ANVIL Solution:** A single unified dashboard window with a top-level **Executive Cockpit (Combined)** plus **Dedicated Specialized Dashboards** accessible in one click.

---

## 🖥️ The Five Dashboard Views

### 1. 🌐 All-in-One Cockpit (Unified Executive View)
The primary overview displaying cross-platform synchronization and end-to-end pipeline health:
- **Unified Safety Shield:** High-level grade (Grade A / 100/100) combining zero secret leaks, clean AST import hygiene, and passing tests.
- **Ecosystem Health Matrix:** Real-time synchronization status across ANVIL Verification, ECC Skills, REA Binary Inspection, and Control Center Harness Readiness.
- **Live Pipeline Activity:** Traces the lifecycle of a task from initial binary inspection (REA) to clean reimplementation (ECC) and automated stop-hook verification (ANVIL).

### 2. 🛡️ ANVIL Verification Gate & Policy
Dedicated view for deterministic codebase governance:
- **Shield Security Findings:** Entropy secret scanning results, sandbox boundary status, and AST circular dependency detection.
- **Change Risk & Blast Radius:** Downstream consumer impact score, modified files, and recommended test targets for uncommitted diffs.
- **Zero-Baseline Policy Status:** Proves repository health without relying on stale baseline suppressions.
- **Hook Status:** Real-time indicator for `.git/hooks/pre-commit` and client-side stop hooks (`anvil install --hooks`).

### 3. 🧠 ECC Skills, Habits & Context Memory
Dedicated view for `affaan-m/ECC` knowledge and prompt rules:
- **Curated Skills Registry:** Active domain rules across Next.js 15, Rust, Python, Go, Cloudflare, and Docker.
- **Lifecycle Tracker:** Live progression through `plan ➔ test ➔ implement ➔ review ➔ verify ➔ remember`.
- **Engineering Instincts Ledger:** Persistent agent memory recording learned habits and post-mortems to eliminate recurring mistakes.
- **Skill Security Scanner:** Audit status powered by `anvil agent-security` (verifying 0 prompt injections or hidden Unicode tag characters).

### 4. 🔍 REA Binary & Bundle Reverse Engineering
Dedicated view for `morluto/rea` black-box decompilation:
- **Decompiled Target Ledger:** Status of inspected native binaries (`.dll`, `.so`, `.exe`), Electron IPC channels, and minified JavaScript source maps.
- **Recovered Symbols:** Extracted function signatures, interface shapes, and struct definitions.
- **Clean Polyfill Preview:** Verification that reimplementations are authored cleanly without copying proprietary binary blobs.
- **REA MCP Tools:** Verification that `rea_decompile`, `rea_extract_symbols`, and `rea_inspect_ipc` are connected via stdio.

### 5. ⚡ ANVIL Control Center, Scorecard & Benchmarks
Dedicated view for harness readiness, verified loops, instincts, and multi-agent benchmarks:
- **Harness Readiness Scorecard:** 9-category deterministic scorecards served on `/api/anvil/scorecard`.
- **Agent Leaderboard:** Accuracy, pass rate, and token efficiency scorecards comparing configured providers and models.
- **Token Compression:** Metrics demonstrating 96%+ token reductions using compact AST summaries over raw source reads.
- **Transactional Rollback:** Inventory of snapshot backups in `.anvil/backups/` with byte-accurate undo (`anvil undo <backupId>`).
- **Execution Traces:** Step-by-step history of multi-agent plans and decisions stored under `.anvil/traces/`.

---

## 🧩 Modular Server Implementation

The local dashboard server ([`src/core/dashboard-server.ts`](../src/core/dashboard-server.ts)) delegates to focused submodules under `src/core/dashboard/`:
- `http-helpers.ts` — Loopback Host validation and JSON/HTML response helpers
- `sse.ts` — Live Server-Sent Events client registry and broadcasts
- `styles.ts` & `page.ts` & `client-script.ts` — Cockpit UI layout, theme, and browser script
- `routes-get.ts` & `routes-post.ts` — Read/write API handlers reading `.anvil/` state

---

## 🚀 How to Launch the Local Dashboard

Start the local loopback dashboard at any time:

```bash
anvil dashboard .
```

- Binds exclusively to loopback (`127.0.0.1`) with Host header validation to prevent DNS rebinding attacks.
- Operates 100% offline with zero external network tracking or third-party telemetry.
- Zero API token costs.
