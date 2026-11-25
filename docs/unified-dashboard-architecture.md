# Unified Multi-Cockpit Dashboard Architecture

ANVIL provides a unified engineering control center combining **Verification Gate**, **Agent Toolkit**, **Binary Intelligence**, and **Control Center & Harness Scorecard** workflows into one cohesive cockpit with dedicated domain views.

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                         UNIFIED WORKBENCH COCKPIT (SEPARATE YET COMBINED)                       │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ [ 🌐 Combined ]  [ 🛡️ ANVIL Gate ]  [ 🧠 Agent Toolkit ]  [ 🔬 Binary Intel ]  [ ⚡ Control ]   │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 The Philosophy: "Separate Dashboards, Combined Experience"

Modern AI-assisted software engineering spans specialized operational domains:
1. **Verification & CI Governance:** Static policies, AST blast radius, secret detection, and pre-commit checks.
2. **Agent Toolkit & Rules:** Curated specialist roles, domain skills, workflow commands, and learned habits.
3. **Binary & Provenance Intelligence:** Native binary magic-byte classification (`PE/COFF`, `ELF`, `Mach-O`, `WASM`, `ZIP/APK`, `SQLite 3`), source maps, and capture redaction checks.
4. **Agent Intelligence & Benchmarks:** Multi-agent evaluation scorecards, verified loop receipts, and execution traces.

**The ANVIL Solution:** A single unified dashboard window with a top-level **Combined Cockpit** plus **Dedicated Domain Tabs** accessible in one click.

---

## 🖥️ Dashboard Views

### 1. 🌐 Combined Cockpit
Top-level overview summarizing verification grade, loaded skills/rules, binary provenance status, and live gate posture.

### 2. 🛡️ ANVIL Verification Gate & Policy
- **Shield Security Findings:** Secret entropy scanning, sandbox boundary compliance, and AST circular import checks.
- **Change Risk & Blast Radius:** Downstream impacted modules and recommended test targets for uncommitted changes.
- **Zero-Baseline Policy Status:** Proves repository health without stale baseline suppressions.
- **Hook Status:** Live indicator for `.git/hooks/pre-commit` and harness stop hooks (`anvil install --hooks`).

### 3. 🧠 Agent Toolkit, Skills & Habits
Dedicated view for ANVIL's native catalog (`catalog/`) and workspace skills (`skills/`, `.anvil/skills/`):
- **Curated Catalog Registry:** `49` specialist roles, `76` catalog skills, `34` commands, and `26` language rule sets across `14` stacks.
- **Engineering Instincts Ledger:** Persistent agent memory recording learned habits under `.anvil/`.
- **Skill Security Scanner:** Audited via `anvil agent-security` (`0` prompt injections or hidden Unicode tag characters).

### 4. 🔬 Binary & Provenance Intelligence
Dedicated view powered natively by `src/core/binary-intelligence.ts` (`anvil binary` / `anvil_binary_intelligence`):
- **Binary Asset Inventory:** Detects native executables/libraries (`.exe`, `.dll`, `.so`, `.dylib`, `.bin`), `.wasm`/`.wat`, `.apk`/`.aab`/`.ipa`, `.sqlite`/`.db`, `.js.map`, web bundles, and `.har`/`.pcap` captures.
- **Magic-Byte Header Inspector:** Identifies `PE/COFF`, `ELF`, `Mach-O` (`32/64/Universal`), `WASM`, `ZIP/Archive`, and `SQLite 3` headers locally with zero third-party native dependencies.
- **Provenance Rules (`ANVIL-BIN-001`..`003`):** Flags tracked binaries inside `src/`/`lib/`, exposed credentials in source map `sourcesContent`, and unredacted auth headers in captures.

### 5. ⚡ ANVIL Control Center, Scorecard & Benchmarks
- **Harness Readiness Scorecard:** Deterministic 9-category scorecard served on `/api/anvil/scorecard`.
- **Agent Leaderboard:** Accuracy, pass rate, and token efficiency across benchmark runs.
- **Transactional Rollback:** Snapshot backups in `.anvil/backups/` with atomic undo (`anvil undo <backupId>`).
- **Execution Traces:** Multi-agent workflow plans and execution history in `.anvil/traces/`.

---

## 🧩 Modular Server Implementation

The local dashboard server ([`src/core/dashboard-server.ts`](../src/core/dashboard-server.ts)) delegates to focused submodules under `src/core/dashboard/`:
- `http-helpers.ts` — Loopback Host validation and JSON/HTML response helpers
- `sse.ts` — Live Server-Sent Events client registry and broadcasts
- `styles.ts`, `page.ts`, & `client-script.ts` — Cockpit UI layout, theme, and browser script
- `routes-get.ts` & `routes-post.ts` — Read/write API handlers reading `.anvil/` state

---

## 🚀 Launch Locally

```bash
anvil dashboard .
```

- Binds exclusively to loopback (`127.0.0.1`) with Host header validation to prevent DNS rebinding.
- Operates 100% offline with zero telemetry.
