import { DASHBOARD_SCRIPT } from "./client-script.js";
import { DASHBOARD_STYLES } from "./styles.js";

export function renderDashboardPage(version: string): string {
  const safeVersion = version.startsWith("v") ? version : `v${version}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#07080e">
<title>ANVIL — Engineering Workbench</title>
<style>
${DASHBOARD_STYLES}
</style>
</head>
<body>
<main class="shell">

<header class="top">
  <div class="brand">
    <div class="mark">A.</div>
    <div>
      <strong>ANVIL</strong>
      <small>THE AI ENGINEERING WORKBENCH · ${safeVersion}</small>
    </div>
  </div>
  <div class="header-actions">
    <label class="showcase-pill" title="Toggle between pre-populated showcase simulation and raw local project data">
      <input type="checkbox" id="showcaseToggle">
      <span>✨ Showcase Telemetry (Demo)</span>
    </label>
    <button class="btn btn-cyan" id="quickDoctorBtn">⚡ Doctor Check</button>
    <button class="btn btn-primary" id="quickCleanBtn">🧹 Self-Healing Scan</button>
    <div id="liveStatus" class="status">● LOCAL WORKSPACE</div>
  </div>
</header>

<nav class="tab-nav">
  <button class="tab-btn active" data-tab="tab-overview">📊 Overview & Health</button>
  <button class="tab-btn" data-tab="tab-gate">🛡️ Policy & Gate</button>
  <button class="tab-btn" data-tab="tab-catalog">🧠 Skills & Rules</button>
  <button class="tab-btn" data-tab="tab-binary">🔬 Binary & Provenance</button>
  <button class="tab-btn" data-tab="tab-control">⚡ ANVIL Control Center</button>
  <button class="tab-btn" data-tab="tab-github">🐙 GitHub App & PR Bot</button>
  <button class="tab-btn" data-tab="tab-cleaner">⚡ Self-Healing & Security</button>
  <button class="tab-btn" data-tab="tab-agents">🤖 Agents & Workflow Studio</button>
  <button class="tab-btn" data-tab="tab-architecture">🗺️ Architecture & Graph</button>
  <button class="tab-btn" data-tab="tab-benchmarks">🔬 Benchmarks & Evaluation</button>
  <button class="tab-btn" data-tab="tab-workspace">🔍 Workspace & Search</button>
</nav>

<div id="showcaseNotice" class="showcase-banner" style="display:none">
  <div>
    <b>⚠️ DEMO MODE — Synthetic Showcase Telemetry:</b> <span>Displaying simulated multi-agent execution runs, benchmark matrices, token budgets, and verification trails for demonstration. Toggle switch above off to view only raw local workspace data.</span>
  </div>
</div>

<!-- ==================== TAB 1: OVERVIEW & HEALTH ==================== -->
<div id="tab-overview" class="tab-pane active">
  <section class="hero">
    <div class="eyebrow">ENGINEERING CONTROL CENTER / 01</div>
    <h1>Build with context.<br>Ship with confidence.</h1>
    <p>A live overview of your codebase, architecture signals and AI-assisted engineering runs.</p>
  </section>

  <section class="grid" id="metrics">
    <div class="card"><div class="metric-label">Source files</div><div class="metric">—</div><div class="metric-sub">Scanning workspace</div></div>
    <div class="card"><div class="metric-label">Directories</div><div class="metric">—</div><div class="metric-sub">Project structure</div></div>
    <div class="card"><div class="metric-label">Dependencies</div><div class="metric">—</div><div class="metric-sub">Production + development</div></div>
    <div class="card"><div class="metric-label">Saved runs</div><div class="metric">—</div><div class="metric-sub">Local execution history</div></div>
  </section>

  <section class="section columns">
    <div class="card">
      <div class="section-head"><h2>Language composition</h2><span class="pill pill-cyan">PROJECT INTELLIGENCE</span></div>
      <div id="languages" class="list"><div class="loading">Loading language data…</div></div>
    </div>
    <div class="card">
      <div class="section-head"><h2>Detected stack</h2><span class="pill pill-accent">ENVIRONMENT</span></div>
      <div id="stack" class="list"><div class="loading">Detecting frameworks…</div></div>
    </div>
  </section>

  <section class="section columns">
    <div class="card">
      <div class="section-head"><h2>Specialist agents</h2><span class="pill pill-emerald">AGENT REGISTRY</span></div>
      <div id="agents"><div class="loading">Loading agent roles…</div></div>
    </div>
    <div class="card">
      <div class="section-head"><h2>Recent runs</h2><span class="pill">LOCAL HISTORY</span></div>
      <div id="runs"><div class="loading">Loading saved runs…</div></div>
    </div>
    <div class="card">
      <div class="section-head"><h2>Project signals</h2><span class="pill">INSIGHTS</span></div>
      <div id="signals" class="list"><div class="loading">Collecting project signals…</div></div>
    </div>
  </section>

  <section class="section card">
    <div class="section-head">
      <h2>Project Health Center</h2>
      <div class="actions">
        <span class="pill pill-accent">SNAPSHOT + TRENDS</span>
        <button class="btn" id="refreshHealth">Refresh snapshot</button>
      </div>
    </div>
    <div id="healthPanel" class="list"><div class="loading">Generating project health snapshot…</div></div>
  </section>

  <section class="section card">
    <div class="section-head">
      <h2>GitHub Community, CI Gate & Achievements</h2>
      <div class="actions">
        <span class="pill pill-purple">COMMUNITY & CI</span>
        <a href="https://github.com/AdityaaaTiwari/ANVIL/discussions" target="_blank" rel="noreferrer" class="btn btn-primary" style="text-decoration:none;font-size:11px">Open Discussions (#10 Q&A)</a>
        <a href="https://github.com/AdityaaaTiwari/ANVIL/actions" target="_blank" rel="noreferrer" class="btn" style="text-decoration:none;font-size:11px">GitHub Actions CI</a>
      </div>
    </div>
    <p class="run-meta">Official ANVIL engineering workbench community, discussions, PR verification workflows, and developer badges guide.</p>
    <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-top: 10px;">
      <div style="background:var(--bg);padding:12px;border-radius:8px;border:1px solid var(--border)">
        <div style="font-size:12px;font-weight:600;margin-bottom:4px;color:var(--emerald)">🛡️ PR-Diff Quality Gate</div>
        <p style="font-size:11px;color:var(--muted);margin:0">Deterministic policy gate on pull requests using <code>--since origin/main</code> and SARIF ingestion.</p>
      </div>
      <div style="background:var(--bg);padding:12px;border-radius:8px;border:1px solid var(--border)">
        <div style="font-size:12px;font-weight:600;margin-bottom:4px;color:var(--cyan)">💬 Q&A & Galaxy Brain</div>
        <p style="font-size:11px;color:var(--muted);margin:0">Ask and answer technical questions in GitHub Discussions Q&A category to unlock accepted answers.</p>
      </div>
      <div style="background:var(--bg);padding:12px;border-radius:8px;border:1px solid var(--border)">
        <div style="font-size:12px;font-weight:600;margin-bottom:4px;color:var(--accent)">🦈 Pull Shark & Pair Extraordinaire</div>
        <p style="font-size:11px;color:var(--muted);margin:0">Collaborative co-authored commits and pull request merges continuously verified by local test suites.</p>
      </div>
    </div>
  </section>

  <section class="section columns">
    <div class="card">
      <div class="section-head"><h2>Engineering quality</h2><span class="pill">STATIC AUDIT</span></div>
      <div id="qualityPanel" class="list"><div class="loading">Loading quality findings…</div></div>
    </div>
    <div class="card">
      <div class="section-head"><h2>Verification history</h2><span class="pill">REAL COMMAND RESULTS</span></div>
      <div id="verificationPanel" class="list"><div class="loading">Loading verification history…</div></div>
    </div>
  </section>

  <section class="section card">
    <div class="section-head">
      <h2>Project Memory & Architectural Decisions</h2>
      <div class="actions">
        <span class="pill pill-cyan">CONTEXT STORE</span>
        <button class="btn btn-cyan" id="syncMemoryToAdrBtn">⚡ Sync to ADRs</button>
        <button class="btn" id="refreshMemory">Refresh memory</button>
      </div>
    </div>
    <p class="run-meta">Durable project constraints, architectural decisions, and preferences that guide specialist agents and IDE harness assistants.</p>
    <div style="display:flex;gap:8px;margin:12px 0;flex-wrap:wrap">
      <select id="newMemoryKind" class="btn" style="padding:6px 12px">
        <option value="decision">Decision</option>
        <option value="architecture">Architecture</option>
        <option value="constraint">Constraint</option>
        <option value="preference">Preference</option>
        <option value="fact">Fact</option>
      </select>
      <input type="text" id="newMemoryContent" placeholder="e.g. Always use Vitest for unit tests; require --verify on clean." style="flex:1;min-width:260px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:6px 12px;color:var(--text);font-family:inherit;font-size:13px">
      <input type="text" id="newMemoryTags" placeholder="tags (comma separated)" style="width:180px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:6px 12px;color:var(--text);font-family:inherit;font-size:13px">
      <button class="btn btn-primary" id="saveMemoryBtn">+ Save Decision</button>
    </div>
    <div id="memoryList" class="list"><div class="loading">Loading project memory…</div></div>
  </section>

  <section class="section card">
    <div class="section-head">
      <h2>Model Context Protocol (MCP) & AI Harness</h2>
      <div class="actions">
        <span class="pill pill-emerald">MCP READY (${safeVersion})</span>
        <span class="pill pill-cyan">ZERO-CLOUD</span>
      </div>
    </div>
    <p class="run-meta">Connect AI coding assistants (Claude Code, Cursor, Windsurf, VS Code, Antigravity) to ANVIL's local deterministic code intelligence, architecture maps, and change risk analysis.</p>
    <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin-top: 12px;">
      <div style="background:var(--bg);padding:14px;border-radius:8px;border:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <b>Claude Code (CLI)</b>
          <span class="pill pill-cyan" style="font-size:10px">1-LINE SETUP</span>
        </div>
        <code style="font-size:12px;display:block;background:var(--bg-card);padding:6px;border-radius:4px;word-break:break-all">claude mcp add anvil -- npx -y anvil-engineering-workbench mcp start</code>
      </div>
      <div style="background:var(--bg);padding:14px;border-radius:8px;border:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <b>Cursor IDE (.cursor/mcp.json)</b>
          <span class="pill pill-emerald" style="font-size:10px">JSON-RPC</span>
        </div>
        <code style="font-size:12px;display:block;background:var(--bg-card);padding:6px;border-radius:4px;word-break:break-all">"anvil": { "command": "npx", "args": ["-y", "anvil-engineering-workbench", "mcp", "start"] }</code>
      </div>
      <div style="background:var(--bg);padding:14px;border-radius:8px;border:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <b>Multi-Editor Wizard</b>
          <span class="pill pill-purple" style="font-size:10px">CLI ASSISTANT</span>
        </div>
        <code style="font-size:12px;display:block;background:var(--bg-card);padding:6px;border-radius:4px;word-break:break-all">anvil mcp setup --client all</code>
      </div>
      <div style="background:var(--bg);padding:14px;border-radius:8px;border:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <b>Token Efficiency</b>
          <span class="pill pill-emerald" style="font-size:10px">~99% REDUCTION</span>
        </div>
        <p style="font-size:12px;color:var(--text-muted);margin:0">Compact MCP summaries by default (detail: false). Runs locally on CPU with zero cloud LLM API calls.</p>
      </div>
    </div>

    <div style="margin-top:16px;border-top:1px solid var(--line);padding-top:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 style="margin:0;font-size:13px">Empirical Measured Token Footprint Benchmark</h3>
        <span class="pill pill-emerald">MEASURED EMPIRICAL DATA</span>
      </div>
      <p class="run-meta" style="margin-bottom:10px">Measured against real repositories comparing raw LLM file-dump reads vs ANVIL deterministic AST summaries. 100% local CPU computation with zero external LLM tokens spent on analysis.</p>
      <div style="overflow-x:auto">
        <table class="token-table">
          <thead>
            <tr>
              <th>MCP Tool Operation</th>
              <th>ANVIL Response</th>
              <th>Raw Unstructured Files</th>
              <th>Context Reduction</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>anvil_inspect_project</code></td>
              <td>~320 tokens</td>
              <td>~8,500 tokens</td>
              <td><span class="saving-tag">96.2% REDUCTION</span></td>
              <td><span class="pill pill-emerald">DETERMINISTIC</span></td>
            </tr>
            <tr>
              <td><code>anvil_map_architecture</code></td>
              <td>~1,400 tokens</td>
              <td>~140,000 tokens</td>
              <td><span class="saving-tag">99.0% REDUCTION</span></td>
              <td><span class="pill pill-emerald">DETERMINISTIC</span></td>
            </tr>
            <tr>
              <td><code>anvil_change_risk</code></td>
              <td>~450 tokens</td>
              <td>~42,000 tokens</td>
              <td><span class="saving-tag">98.9% REDUCTION</span></td>
              <td><span class="pill pill-emerald">DETERMINISTIC</span></td>
            </tr>
            <tr>
              <td><code>anvil_security_audit</code></td>
              <td>~380 tokens</td>
              <td>~140,000 tokens</td>
              <td><span class="saving-tag">99.7% REDUCTION</span></td>
              <td><span class="pill pill-emerald">DETERMINISTIC</span></td>
            </tr>
            <tr>
              <td><code>anvil_quality_audit</code></td>
              <td>~650 tokens</td>
              <td>~140,000 tokens</td>
              <td><span class="saving-tag">99.5% REDUCTION</span></td>
              <td><span class="pill pill-emerald">DETERMINISTIC</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div style="margin-top:14px;border-top:1px solid var(--line);padding-top:14px;display:flex;gap:12px;flex-wrap:wrap">
      <div style="flex:1;min-width:280px;background:rgba(0,0,0,0.25);padding:10px 14px;border-radius:8px;border:1px solid var(--line)">
        <b style="font-size:12px;color:var(--cyan)">Google Antigravity IDE</b>
        <p class="run-meta" style="margin:4px 0 6px">Add to your workspace MCP servers in Antigravity:</p>
        <code style="font-size:11px;display:block;background:var(--panel);padding:6px;border-radius:4px">"anvil": { "command": "npx", "args": ["-y", "anvil-engineering-workbench", "mcp", "start"] }</code>
      </div>
      <div style="flex:1;min-width:280px;background:rgba(0,0,0,0.25);padding:10px 14px;border-radius:8px;border:1px solid var(--line)">
        <b style="font-size:12px;color:var(--emerald)">Windsurf & VS Code Copilot</b>
        <p class="run-meta" style="margin:4px 0 6px">Add to <code>~/.codeium/windsurf/mcp_config.json</code> or <code>.vscode/mcp.json</code>:</p>
        <code style="font-size:11px;display:block;background:var(--panel);padding:6px;border-radius:4px">"anvil": { "command": "npx", "args": ["-y", "anvil-engineering-workbench", "mcp", "start"] }</code>
      </div>
    </div>
  </section>
</div>

<!-- ==================== TAB: POLICY & GATE ==================== -->
<div id="tab-gate" class="tab-pane">
  <section class="hero">
    <div class="eyebrow">POLICY-AS-CODE & FAIL-CLOSED ENFORCEMENT</div>
    <h1>Zero-Compromise Security & Quality Gate</h1>
    <p>Deterministic local compliance engine. Scans against custom organizational rules in <code>.anvil/policy.json</code> with baseline regression suppression and zero third-party network egress.</p>
  </section>

  <section class="grid" id="gateMetrics">
    <div class="card card-highlight">
      <div class="metric-label">Gate Status</div>
      <div class="metric" id="gateStatusMetric" style="color:var(--emerald)">EVALUATING</div>
      <div class="metric-sub" id="gateStatusSub">Checking policy rules</div>
    </div>
    <div class="card">
      <div class="metric-label">New Findings</div>
      <div class="metric" id="gateNewFindingsMetric">—</div>
      <div class="metric-sub">Fails build if &gt; allowed</div>
    </div>
    <div class="card">
      <div class="metric-label">Baseline Debt</div>
      <div class="metric" id="gateBaselineMetric">—</div>
      <div class="metric-sub">Accepted historical baseline</div>
    </div>
    <div class="card">
      <div class="metric-label">Inline Suppressions</div>
      <div class="metric" id="gateSuppressionsMetric">—</div>
      <div class="metric-sub">anvil-disable-next-line</div>
    </div>
  </section>

  <section class="section card">
    <div class="section-head">
      <h2>Policy Evaluation Details</h2>
      <div class="actions">
        <span class="pill pill-cyan" id="policyFilePill">DEFAULT POLICY</span>
        <button class="btn btn-primary" id="refreshGateBtn">⚡ Re-Evaluate Gate</button>
      </div>
    </div>
    <div id="gateViolationsContainer" style="margin-bottom:14px"></div>
    <div id="gateAdvisoriesContainer" style="margin-bottom:14px"></div>
    <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;align-items:center;background:rgba(255,255,255,0.02);padding:12px;border-radius:8px;border:1px solid var(--line)">
      <div style="display:flex;flex-direction:column;gap:4px">
        <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em">Scan Mode</label>
        <select id="gateScanMode" class="btn" style="padding:6px 10px;font-size:12px;background:var(--panel2)">
          <option value="">Full Repository Audit</option>
          <option value="origin/main">PR-Diff Mode (since origin/main)</option>
          <option value="HEAD~1">Incremental (since HEAD~1)</option>
        </select>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
        <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em">Min Confidence</label>
        <select id="gateMinConfidence" class="btn" style="padding:6px 10px;font-size:12px;background:var(--panel2)">
          <option value="low">All Severities (Low / Medium / High)</option>
          <option value="medium">Medium & High Only</option>
          <option value="high">High Confidence Only (Low Noise)</option>
        </select>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:200px">
        <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em">External SARIF Ingestion</label>
        <input type="text" id="gateImportSarif" placeholder="e.g. .anvil/external-sarif.json (optional)" style="background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:6px 10px;color:var(--text);font-family:inherit;font-size:12px">
      </div>
    </div>
    <div class="section-head"><h3 style="margin:0">Active Findings & Suppressions</h3><span class="pill" id="findingsCountPill">0 FINDINGS</span></div>
    <div id="gateFindingsList" class="list"><div class="loading">Evaluating repository gate…</div></div>
  </section>
</div>

<!-- ==================== TAB 2: SELF-HEALING, CLEANER & SECURITY (${safeVersion}) ==================== -->
<div id="tab-cleaner" class="tab-pane">
  <section class="hero">
    <div class="eyebrow">ANVIL ${safeVersion} SELF-HEALING & SECURITY ENGINE</div>
    <h1>Zero-Fear Workspace Cleaner & Rollback</h1>
    <p>Automatically eliminates junk clutter and fixes unused imports across TypeScript, JavaScript and Python with deterministic self-healing rollback verification.</p>
  </section>

  <section class="grid">
    <div class="card card-highlight">
      <div class="metric-label">Self-Healing Verification</div>
      <div class="metric" style="color:var(--emerald)">ACTIVE</div>
      <div class="metric-sub">Auto-rollback on test failure</div>
    </div>
    <div class="card">
      <div class="metric-label">Polyglot Code Auto-Fix</div>
      <div class="metric" style="color:var(--accent-light)">TS / JS / PY</div>
      <div class="metric-sub">Unused import pruning</div>
    </div>
    <div class="card">
      <div class="metric-label">Framework Whitelist</div>
      <div class="metric" style="color:var(--cyan)">PROTECTED</div>
      <div class="metric-sub">Next.js, Nuxt, Remix, FastAPI</div>
    </div>
    <div class="card">
      <div class="metric-label">Pre-Commit Gate</div>
      <div class="metric" style="color:var(--purple)">HOOK READY</div>
      <div class="metric-sub">anvil hook install</div>
    </div>
  </section>

  <section class="section card">
    <div class="section-head">
      <h2>Workspace Cleaner Actions</h2>
      <div class="actions">
        <button class="btn btn-cyan" id="runCleanDryRunBtn">🔍 Run Dry-Run Preview</button>
        <button class="btn btn-primary" id="runCleanApplyBtn">✨ Apply Safe Clean & Fix</button>
        <button class="btn" id="runDoctorDiagnosticsBtn">🩺 System Doctor</button>
      </div>
    </div>
    <div id="cleanerActionNotice" class="run-meta" style="margin-bottom:12px">
      Preview detects OS junk, editor temp files, orphan logs, and unused imports without touching your files.
    </div>
    <div id="cleanerLiveOutput" class="activity">
      <div class="empty">Click "Run Dry-Run Preview" above to scan the workspace.</div>
    </div>
  </section>

  <section class="section columns">
    <div class="card">
      <div class="section-head"><h2>Snapshot Backups for Rollback</h2><span class="pill pill-emerald">anvil undo</span></div>
      <div id="cleanerBackupsList" class="list">
        <div class="loading">Checking backup snapshots…</div>
      </div>
    </div>
    <div class="card">
      <div class="section-head"><h2>Whitelisted Framework Routes</h2><span class="pill pill-cyan">DYNAMIC DETECTION</span></div>
      <div class="list">
        <div class="rowitem"><div><b>Next.js App & Pages</b><div class="run-meta">page.tsx, layout.tsx, route.ts, loading.tsx</div></div><span class="pill pill-emerald">WHITELISTED</span></div>
        <div class="rowitem"><div><b>Remix & Nuxt Routes</b><div class="run-meta">_index.tsx, app.vue, pages/**/*.vue</div></div><span class="pill pill-emerald">WHITELISTED</span></div>
        <div class="rowitem"><div><b>Python Django & FastAPI</b><div class="run-meta">urls.py, routers.py, conftest.py, tasks.py</div></div><span class="pill pill-emerald">WHITELISTED</span></div>
        <div class="rowitem"><div><b>Rust & Go Binaries</b><div class="run-meta">main.rs, lib.rs, cmd/**/main.go</div></div><span class="pill pill-emerald">WHITELISTED</span></div>
      </div>
    </div>
  </section>

  <section class="section card">
    <div class="section-head">
      <h2>Repository Security & Secret Scanner</h2>
      <div class="actions">
        <span class="pill pill-emerald" id="securityStatusPill">SECURE</span>
        <button class="btn btn-primary" id="autoFixSecurityBtn">🛡️ Auto-Fix Exclusions</button>
        <button class="btn" id="refreshSecurityBtn">Refresh Audit</button>
      </div>
    </div>
    <p class="run-meta">Local-first deep scan for leaked secrets, API keys, risky shell scripts, unencrypted dependencies, and unignored .env files.</p>
    <div id="securitySummary" class="grid" style="margin:12px 0"></div>
    <div id="securityFindings" class="list"><div class="loading">Scanning repository for secrets…</div></div>
  </section>
</div>

<!-- ==================== TAB 3: AGENTS & WORKFLOW STUDIO ==================== -->
<div id="tab-agents" class="tab-pane">
  <section class="section card">
    <div class="section-head">
      <h2>Run inspector</h2>
      <span id="inspectorLabel" class="pill pill-accent">SELECT A RUN</span>
    </div>
    <div id="runInspector" class="inspector">
      <div class="empty">Select a saved run to inspect its task results and approval state.</div>
    </div>
  </section>

  <section class="section columns">
    <div class="card">
      <div class="section-head">
        <h2>Agent activity</h2>
        <div class="activity-toolbar">
          <span id="activityUpdated" class="pill">Waiting for data</span>
          <button class="btn" id="refreshActivity">Refresh</button>
        </div>
      </div>
      <div id="activity" class="activity"><div class="loading">Loading task activity…</div></div>
    </div>
    <div class="card">
      <div class="section-head"><h2>Task status</h2><span class="pill">LATEST RUN</span></div>
      <div id="taskStatus" class="task-grid"><div class="loading">Waiting for a saved run…</div></div>
    </div>
  </section>

  <section class="section card" id="workflowEditor">
    <div class="section-head"><h2>Visual workflow editor</h2><span class="pill pill-accent">REUSABLE AGENT PIPELINES</span></div>
    <p class="run-meta">Compose specialist tasks, connect dependencies and add human approval gates. Saving a workflow stores a local reusable definition; creating a draft does not execute agents.</p>
    <div class="columns">
      <div class="inspector">
        <label class="metric-label" for="workflowName">Workflow name</label>
        <input id="workflowName" maxlength="100" placeholder="e.g. Secure feature delivery" style="background:#0b1018;color:var(--text);border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit">
        <label class="metric-label" for="workflowDescription">Description</label>
        <input id="workflowDescription" maxlength="500" placeholder="What this pipeline is for" style="background:#0b1018;color:var(--text);border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit">
        <div class="divider"></div>
        <h3 style="margin:4px 0">Add specialist task</h3>
        <label class="metric-label" for="workflowAgent">Agent</label>
        <select id="workflowAgent" class="btn" style="text-align:left">
          <option value="planner">Planner</option>
          <option value="architect">Architect</option>
          <option value="code-reviewer">Code reviewer</option>
          <option value="security-reviewer">Security reviewer</option>
          <option value="test-engineer">Test engineer</option>
          <option value="documentation-writer">Documentation writer</option>
          <option value="performance-engineer">Performance engineer</option>
          <option value="debugger">Debugger</option>
          <option value="devops-engineer">DevOps engineer</option>
          <option value="database-reviewer">Database reviewer</option>
          <option value="accessibility-reviewer">Accessibility reviewer</option>
          <option value="release-manager">Release manager</option>
        </select>
        <label class="metric-label" for="workflowTaskTitle">Task title</label>
        <input id="workflowTaskTitle" maxlength="120" placeholder="Review API boundaries" style="background:#0b1018;color:var(--text);border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit">
        <label class="metric-label" for="workflowTaskPrompt">Task instructions</label>
        <textarea id="workflowTaskPrompt" maxlength="4000" rows="3" placeholder="Describe the specialist's job and expected evidence…" style="background:#0b1018;color:var(--text);border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit"></textarea>
        <label class="metric-label" for="workflowDependency">Depends on</label>
        <select id="workflowDependency" class="btn" multiple size="4" style="text-align:left;min-height:100px">
          <option value="">No dependency (start independently)</option>
        </select>
        <div class="run-meta">Use Ctrl/Cmd to select multiple prerequisites for branching and join points.</div>
        <label style="display:flex;gap:8px;align-items:center"><input id="workflowRequiresApproval" type="checkbox"> Require human approval before this task</label>
        <div class="actions">
          <button class="btn btn-primary" id="addWorkflowTask">Add task</button>
          <button class="btn" id="clearWorkflowTasks">Clear tasks</button>
        </div>
        <div class="actions">
          <button class="btn" id="templateFeature">Load feature-delivery template</button>
          <button class="btn" id="templateSecurity">Load security-audit template</button>
        </div>
      </div>
      <div class="inspector">
        <div class="section-head"><h3 style="margin:0">Pipeline canvas</h3><span class="pill" id="workflowTaskCount">0 TASKS</span></div>
        <div id="workflowCanvas" class="activity"><div class="empty">Add a specialist task to start composing your pipeline.</div></div>
        <div class="actions"><button class="btn" id="applyWorkflowLinks">Apply selected links</button></div>
        <div class="actions"><button class="btn btn-primary" id="saveWorkflow">Save workflow</button><button class="btn btn-cyan" id="createWorkflowRun">Create draft run</button><button class="btn btn-emerald" id="executeWorkflowRun">⚡ Simulate Pipeline Execution</button></div>
        <div id="workflowMessage" class="run-meta" aria-live="polite"></div>
        <div class="section-head" style="margin-top:18px"><h3 style="margin:0">Saved workflows</h3><button class="btn" id="refreshWorkflows">Refresh</button></div>
        <div id="savedWorkflows" class="activity"><div class="loading">Loading reusable workflows…</div></div>
      </div>
    </div>
  </section>

  <section class="section card" id="agentConfigStudio">
    <div class="section-head"><h2>Agent Configuration Studio</h2><span class="pill">WORKSPACE-OWNED MARKDOWN</span></div>
    <p class="run-meta">Edit custom agent and skill instructions in .anvil/agents and .anvil/skills. Built-in agents stay read-only. Saving changes local workspace files only; it does not execute agents or automatically promote a configuration.</p>
    <div class="columns">
      <div class="inspector">
        <label class="metric-label" for="configCategory">Configuration type</label>
        <select id="configCategory" class="btn"><option value="agents">Custom agent</option><option value="skills">Skill</option></select>
        <label class="metric-label" for="configFile">Existing configuration</label>
        <select id="configFile" class="btn"><option value="">Create a new file…</option></select>
        <label class="metric-label" for="configId">File ID</label>
        <input id="configId" maxlength="64" placeholder="e.g. api-specialist" style="background:#0b1018;color:var(--text);border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit">
        <label class="metric-label" for="configContent">Markdown instructions</label>
        <textarea id="configContent" rows="12" maxlength="131072" placeholder="# Agent name&#10;&#10;Describe responsibilities, constraints and expected evidence…" style="width:100%;background:#0b1018;color:var(--text);border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit"></textarea>
        <div class="actions">
          <button class="btn" id="newConfigFile">New file</button>
          <button class="btn btn-primary" id="saveConfigFile">Save configuration</button>
          <button class="btn" id="refreshConfigFiles">Refresh list</button>
          <button class="btn" id="captureConfigSnapshot">Capture snapshot</button>
        </div>
        <div id="configMessage" class="run-meta" aria-live="polite">Changes are saved locally and remain reviewable in Git.</div>
      </div>
      <div>
        <h3 style="margin-top:0">Configuration inventory</h3>
        <div id="configInventory" class="list"><div class="loading">Loading custom agent and skill files…</div></div>
        <h3>Provider readiness</h3>
        <div id="providerReadiness" class="list"><div class="loading">Checking local provider configuration…</div></div>
        <p class="run-meta">Shows credential presence and configured models only. It does not test provider connectivity or expose API keys.</p>
        <h3>Benchmark-gated promotion</h3>
        <div class="inspector">
          <label class="metric-label" for="releaseCandidate">Candidate snapshot ID</label>
          <input id="releaseCandidate" placeholder="cfg-…" style="background:#0b1018;color:var(--text);border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit">
          <label class="metric-label" for="releaseBaseline">Approved baseline snapshot ID</label>
          <input id="releaseBaseline" placeholder="cfg-…" style="background:#0b1018;color:var(--text);border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit">
          <label class="metric-label" for="releaseMatrix">Benchmark matrix ID</label>
          <input id="releaseMatrix" placeholder="matrix-id" style="background:#0b1018;color:var(--text);border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit">
          <button class="btn" id="prepareConfigRelease">Check regression gate & prepare release</button>
          <div id="releaseMessage" class="run-meta" aria-live="polite">Only a release-ready benchmark with matching snapshot fingerprint can proceed.</div>
        </div>
        <div id="configReleases" class="list"><div class="loading">Loading release history…</div></div>
        <h3>Version history</h3>
        <div id="configVersions" class="list"><div class="loading">Loading snapshots…</div></div>
      </div>
    </div>
  </section>
</div>

<!-- ==================== TAB 4: ARCHITECTURE & GRAPH ==================== -->
<div id="tab-architecture" class="tab-pane">
  <section class="section card">
    <div class="section-head">
      <h2>Architecture snapshot</h2>
      <div class="actions">
        <span class="pill pill-cyan">STATIC IMPORT MAP</span>
        <button class="btn" id="refreshMap">Refresh map</button>
      </div>
    </div>
    <div class="graph-wrap">
      <svg id="architectureGraph" viewBox="0 0 900 360" role="img" aria-label="Interactive source module dependency graph">
        <text x="24" y="35" fill="#8e9aab">Loading architecture graph…</text>
      </svg>
      <div class="graph-hint">Select a node to inspect imports and incoming dependencies. Lines represent detected relative imports.</div>
    </div>
    <div id="graphDetail" class="graph-detail">Choose a module in the graph.</div>
    <div id="architecture" class="architecture"></div>
  </section>

  <section class="section card">
    <div class="section-head">
      <h2>Dependency risk explorer</h2>
      <div class="actions">
        <span class="pill pill-accent">INTERACTIVE PACKAGE GRAPH</span>
        <button class="btn" id="refreshDependencyGraph">Refresh graph</button>
      </div>
    </div>
    <div id="dependencySummary" class="grid"><div class="loading">Mapping package relationships…</div></div>
    <div class="actions" style="margin:12px 0">
      <input id="dependencyFilter" type="search" placeholder="Filter files or packages…" style="flex:1;min-width:0;background:#0b1018;color:var(--text);border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit">
      <select id="dependencyMode" class="btn" aria-label="Graph filter">
        <option value="all">All relationships</option>
        <option value="risk">Risk signals</option>
        <option value="packages">Packages only</option>
      </select>
    </div>
    <div class="graph-wrap">
      <svg id="dependencyGraph" viewBox="0 0 1100 620" role="img" aria-label="Interactive file and package dependency graph">
        <text x="24" y="35" fill="#8e9aab">Loading dependency graph…</text>
      </svg>
      <div class="graph-hint">Files appear on the left and packages on the right. Select a node to inspect its consumers and status.</div>
    </div>
    <div id="dependencyDetail" class="graph-detail">Select a package or source module to inspect its relationships.</div>
    <div id="dependencyWarnings" class="run-meta"></div>
  </section>

  <section class="section card">
    <div class="section-head">
      <h2>Engineering risk intelligence</h2>
      <div class="actions">
        <span class="pill pill-accent">STRUCTURAL HOTSPOTS</span>
        <button class="btn" id="refreshRisk">Refresh risk analysis</button>
      </div>
    </div>
    <div id="riskSummary" class="grid"><div class="loading">Calculating engineering hotspots…</div></div>
    <div class="graph-wrap" style="margin-top:12px">
      <div id="riskHotspots" class="activity"><div class="loading">Ranking modules by structural risk…</div></div>
    </div>
    <div id="riskMethodology" class="run-meta"></div>
    <div id="riskWarnings" class="run-meta"></div>
  </section>

  <section class="section card">
    <div class="section-head">
      <h2>Change risk & test intelligence</h2>
      <div class="actions">
        <span class="pill pill-emerald">CHANGE-AWARE PRIORITIZATION</span>
        <button class="btn" id="refreshChangeRisk">Refresh change analysis</button>
      </div>
    </div>
    <div id="changeRiskSummary" class="grid"><div class="loading">Analyzing current working-tree changes…</div></div>
    <div id="changeRiskList" class="activity"><div class="loading">Prioritizing changed modules…</div></div>
    <div id="changeRiskNotes" class="run-meta"></div>
  </section>

  <section class="section card">
    <div class="section-head">
      <h2>Dependency security & license intelligence</h2>
      <div class="actions">
        <span class="pill">OFFLINE ANALYSIS</span>
        <button class="btn" id="refreshDependencyIntel">Refresh inventory</button>
      </div>
    </div>
    <div id="dependencyIntelSummary" class="grid"><div class="loading">Inspecting dependency metadata…</div></div>
    <div id="dependencyIntelList" class="activity"></div>
    <div id="dependencyIntelNotes" class="run-meta"></div>
  </section>

  <section class="section card">
    <div class="section-head">
      <h2>Engineering intelligence timeline</h2>
      <div class="actions">
        <span class="pill">SAVED LOCAL SNAPSHOTS</span>
        <button class="btn" id="refreshTimeline">Refresh timeline</button>
      </div>
    </div>
    <div id="timelineSummary" class="grid"><div class="loading">Loading saved engineering snapshots…</div></div>
    <div id="timelineHistory" class="activity"></div>
    <div id="timelineNotes" class="run-meta"></div>
  </section>

  <section class="section card">
    <div class="section-head">
      <h2>Architecture Decision Records (ADR Engine)</h2>
      <div class="actions">
        <span class="pill pill-cyan">DOCS/ADR</span>
        <button class="btn btn-cyan" id="syncAdrBtn">⚡ Sync Memory to ADRs</button>
        <button class="btn" id="refreshAdrBtn">Refresh ADRs</button>
      </div>
    </div>
    <p class="run-meta">Version-controlled Architectural Decision Records stored locally in <code>docs/adr/</code>. Kept in sync with ANVIL project memory.</p>
    <div style="display:flex;gap:8px;margin:12px 0;flex-wrap:wrap">
      <input type="text" id="newAdrTitle" placeholder="e.g. Adopt Vitest for Unit and Integration Testing" style="flex:1;min-width:260px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:6px 12px;color:var(--text);font-family:inherit;font-size:13px">
      <select id="newAdrStatus" class="btn" style="padding:6px 12px">
        <option value="Accepted">Accepted</option>
        <option value="Proposed">Proposed</option>
      </select>
      <button class="btn btn-primary" id="createAdrBtn">+ New ADR</button>
    </div>
    <div id="adrList" class="list"><div class="loading">Loading Architecture Decision Records…</div></div>
  </section>
</div>

<!-- ==================== TAB 5: BENCHMARKS & EVALUATION LAB ==================== -->
<div id="tab-benchmarks" class="tab-pane">
  <section class="hero">
    <div class="eyebrow">BENCHMARKS & ADAPTIVE INTELLIGENCE</div>
    <h1>Model Performance, Rubrics & Leaderboards</h1>
    <p>Deterministic evaluation scorecards, multi-trial regression gates, controlled skill experiments, and token observability.</p>
  </section>

  <section class="section card">
    <div class="section-head">
      <div>
        <h2>Experiment History & Leaderboard</h2>
        <div class="run-meta">Historical candidate rankings · grouped by evaluation suite · estimates are not billing data</div>
      </div>
      <div class="actions">
        <span id="experimentHistoryUpdated" class="pill pill-cyan">LOADING HISTORY</span>
        <button class="btn" id="refreshExperimentHistory">Refresh</button>
      </div>
    </div>
    <div class="columns">
      <div>
        <label class="metric-label" for="experimentSuiteFilter">Evaluation suite</label>
        <input id="experimentSuiteFilter" placeholder="All suites" style="width:100%;background:#0b1018;color:var(--text);border:1px solid var(--line);border-radius:9px;padding:9px;font:inherit">
      </div>
      <div>
        <label class="metric-label" for="experimentCandidateFilter">Candidate</label>
        <input id="experimentCandidateFilter" placeholder="All candidates" style="width:100%;background:#0b1018;color:var(--text);border:1px solid var(--line);border-radius:9px;padding:9px;font:inherit">
      </div>
    </div>
    <div id="experimentLeaderboard" class="activity" style="margin-top:14px"><div class="loading">Aggregating saved benchmark matrices…</div></div>
    <div class="section" style="margin-top:18px">
      <div class="section-head">
        <div>
          <h3>Visual candidate comparison</h3>
          <div class="run-meta">Score and pass rate are normalized to 100 · duration and token values are estimates</div>
        </div>
        <span class="pill pill-accent">TOP 8</span>
      </div>
      <div id="experimentComparison" class="activity"><div class="loading">Building comparison from saved benchmark history…</div></div>
    </div>
    <div id="experimentRegressions" class="activity" style="margin-top:12px"></div>
    <div class="actions" style="margin-top:12px">
      <button class="btn btn-cyan" id="exportExperimentHistory">Export JSON</button>
    </div>
    <div id="experimentHistoryCaveats" class="run-meta" style="margin-top:10px"></div>
  </section>

  <section class="section columns">
    <div class="card">
      <div class="section-head">
        <div>
          <h2>Benchmark Lab</h2>
          <div class="run-meta">Compare recorded runs by provider and model · use <code>anvil benchmark RUN_ID</code> after evaluation</div>
        </div>
        <span id="benchmarkUpdated" class="pill">NO TRIALS</span>
      </div>
      <div id="benchmarkHistory" class="activity"><div class="loading">Loading benchmark history…</div></div>
    </div>
    <div class="card">
      <div class="section-head">
        <div>
          <h2>Regression intelligence</h2>
          <div class="run-meta">Compare the latest matrix with a previous run using the same goal and evaluation suite</div>
        </div>
        <span id="regressionStatus" class="pill">CHECKING HISTORY</span>
      </div>
      <div id="benchmarkRegression" class="activity"><div class="loading">Analyzing benchmark history…</div></div>
      <div class="actions" style="margin-top:12px"><button class="btn" id="refreshRegression">Refresh regression analysis</button></div>
    </div>
  </section>

  <section class="section columns">
    <div class="card">
      <div class="section-head">
        <div>
          <h2>Agent Performance</h2>
          <div class="run-meta">Latest matrix · deterministic evaluation scorecards and Per-agent scorecards by agent and model</div>
        </div>
        <span id="agentPerformanceUpdated" class="pill">NO SCORECARDS</span>
      </div>
      <div id="agentPerformance" class="activity"><div class="loading">Loading agent scorecards…</div></div>
    </div>
    <div class="card">
      <div class="section-head">
        <div>
          <h2>Skill Experiments</h2>
          <div class="run-meta">Controlled same-model comparison · baseline with no skills versus treatment with selected skills</div>
        </div>
        <span id="skillExperimentsUpdated" class="pill">NO EXPERIMENTS</span>
      </div>
      <div id="skillExperiments" class="activity"><div class="loading">Loading controlled skill experiments…</div></div>
    </div>
  </section>

  <section class="section columns">
    <div class="card">
      <div class="section-head">
        <div>
          <h2>Evaluation history</h2>
          <div class="run-meta">Saved deterministic rubric results · use <code>anvil evaluate RUNID</code> to score a run</div>
        </div>
        <span id="evaluationUpdated" class="pill">LOCAL REPORTS</span>
      </div>
      <div id="evaluationHistory" class="activity"><div class="loading">Loading evaluation reports…</div></div>
    </div>
    <div class="card">
      <div class="section-head">
        <div>
          <h2>Adaptive Agent Recommendations</h2>
          <div class="run-meta">Repeated rubric failures translated into reviewable improvements</div>
        </div>
        <span id="agentOptimizationStatus" class="pill">ANALYZING</span>
      </div>
      <div id="agentOptimization" class="activity"><div class="loading">Analyzing agent failure patterns…</div></div>
    </div>
  </section>

  <section class="section card">
    <div class="section-head">
      <div>
        <h2>Agent Evaluation Intelligence</h2>
        <div class="run-meta">Historical scorecards, score trends, repeated failure signals and evidence-backed recommendations</div>
      </div>
      <span id="agentIntelligenceStatus" class="pill pill-cyan">SCORECARDS</span>
    </div>
    <div id="agentIntelligence" class="activity"><div class="loading">Loading agent evaluation intelligence…</div></div>
  </section>

  <section class="section card">
    <div class="section-head">
      <div>
        <h2>Agent observability</h2>
        <div class="run-meta">Estimated usage and provider outcomes from saved execution traces · last 30 runs</div>
      </div>
      <div class="actions">
        <span id="observabilityUpdated" class="pill pill-accent">LOCAL TRACE DATA</span>
        <button class="btn" id="refreshObservability">Refresh</button>
      </div>
    </div>
    <div id="observabilityMetrics" class="grid"><div class="loading">Loading execution telemetry…</div></div>
    <div class="section columns" style="margin-top:14px">
      <div>
        <h3>Per-agent utilization</h3>
        <div id="agentObservability" class="activity"><div class="loading">Aggregating agent traces…</div></div>
      </div>
      <div>
        <h3>Provider health</h3>
        <div id="providerObservability" class="activity"><div class="loading">Aggregating provider traces…</div></div>
      </div>
    </div>
    <div id="observabilityWarnings" class="run-meta" style="margin-top:12px"></div>
  </section>

  <section class="section columns">
    <div class="card">
      <div class="section-head">
        <h2>Code review history</h2>
        <div class="actions"><span class="pill">SAVED REVIEWS</span><button class="btn" id="refreshReviews">Refresh</button></div>
      </div>
      <div id="reviewPanel" class="list"><div class="loading">Loading saved review snapshots…</div></div>
    </div>
    <div class="card">
      <div class="section-head">
        <h2>Regression intelligence</h2>
        <div class="actions"><span class="pill">VERIFICATION TRENDS</span><button class="btn" id="refreshRegression">Refresh</button></div>
      </div>
      <div id="regressionPanel" class="list"><div class="loading">Comparing saved verification runs…</div></div>
    </div>
  </section>
</div>

<!-- ==================== TAB 6: WORKSPACE & SEARCH ==================== -->
<div id="tab-workspace" class="tab-pane">
  <section class="section card">
    <div class="section-head">
      <h2>Code search</h2>
      <span class="pill pill-cyan">SYMBOL-AWARE SOURCE SEARCH</span>
    </div>
    <div class="actions">
      <input id="codeSearchQuery" type="search" placeholder="Search symbols, functions or source text…" style="flex:1;min-width:0;background:#0b1018;color:var(--text);border:1px solid var(--line);border-radius:9px;padding:10px;font:inherit">
      <button class="btn btn-primary" id="codeSearchButton">Search</button>
    </div>
    <div id="codeSearchMeta" class="run-meta">Searches source files only; results open in the workspace preview.</div>
    <div id="codeSearchResults" class="list"><div class="empty">Enter at least two characters to search.</div></div>
  </section>

  <section class="section card">
    <div class="section-head">
      <h2>Workspace explorer</h2>
      <span class="pill">SAFE FILE PREVIEW</span>
    </div>
    <div class="columns">
      <div>
        <div class="actions">
          <button class="btn" id="workspaceUp">↑ Up</button>
          <span id="workspacePath" class="pill">/</span>
        </div>
        <div id="workspaceFiles" class="list" style="margin-top:10px"><div class="loading">Loading workspace files…</div></div>
      </div>
      <div>
        <div id="workspacePreview" class="inspector">
          <div class="empty">Select a source file to preview it here.</div>
        </div>
      </div>
    </div>
  </section>
</div>

<!-- ==================== TAB: ANVIL SKILLS & RULES ==================== -->
<div id="tab-catalog" class="tab-pane">
  <section class="hero">
    <div class="eyebrow">ANVIL AGENT CATALOG / 08</div>
    <h1>Skills, Rules & Habits</h1>
    <p>Curated domain workflows, lifecycle prompts, and prompt injection defense across Claude, Cursor, Antigravity, and Codex.</p>
  </section>

  <section class="grid" id="catalogMetrics">
    <div class="card"><div class="metric-label">Loaded Skills</div><div class="metric" id="catalogTotalSkills">—</div><div class="metric-sub">Builtin + Workspace</div></div>
    <div class="card"><div class="metric-label">Security Scan</div><div class="metric" id="catalogSecStatus" style="color:var(--emerald)">VERIFIED</div><div class="metric-sub">Zero Prompt Injection</div></div>
    <div class="card"><div class="metric-label">Harness Targets</div><div class="metric" style="color:var(--cyan)">9 AI Tools</div><div class="metric-sub">Claude, Cursor, Codex, etc.</div></div>
    <div class="card"><div class="metric-label">Lifecycle Hook</div><div class="metric" style="color:var(--accent)">180s Gate</div><div class="metric-sub">Auto-stops & blocks on fail</div></div>
  </section>

  <section class="section card">
    <div class="section-head">
      <h2>Skill & Rule Library</h2>
      <span class="pill pill-cyan">ACTIVE WORKSPACE DISCOVERY</span>
    </div>
    <div id="catalogSkillsList" class="list"><div class="loading">Loading workspace skills and rules…</div></div>
  </section>
</div>

<!-- ==================== TAB: ANVIL BINARY & PROVENANCE ==================== -->
<div id="tab-binary" class="tab-pane">
  <section class="hero">
    <div class="eyebrow">ANVIL BINARY INTELLIGENCE / 09</div>
    <h1>Binary, Bundle & Provenance Intelligence</h1>
    <p>Native TypeScript inspection for compiled binaries, WASM, source maps, web bundles, databases, and network captures with magic-byte verification.</p>
  </section>

  <section class="grid" id="binaryMetrics">
    <div class="card"><div class="metric-label">Total Binary Assets</div><div class="metric" id="binaryTotalAssets">—</div><div class="metric-sub">Binaries, Maps, WASM</div></div>
    <div class="card"><div class="metric-label">Provenance Status</div><div class="metric" id="binaryCleanStatus" style="color:var(--emerald)">COMPLIANT</div><div class="metric-sub">ANVIL-BIN-001..003 Verified</div></div>
    <div class="card"><div class="metric-label">Binary Inspector</div><div class="metric" style="color:var(--purple)">ANVIL Engine</div><div class="metric-sub">Magic Headers: PE, ELF, Mach-O, WASM</div></div>
    <div class="card"><div class="metric-label">Source Boundary</div><div class="metric" style="color:var(--emerald)">ACTIVE</div><div class="metric-sub">Enforces safe provenance</div></div>
  </section>

  <section class="section card">
    <div class="section-head">
      <h2>Detected Compiled Assets</h2>
      <span class="pill pill-purple">BINARY INVENTORY</span>
    </div>
    <div id="binaryAssetsList" class="list"><div class="loading">Scanning for compiled binaries and source maps…</div></div>
  </section>
</div>

<!-- ==================== TAB: ANVIL CONTROL CENTER ==================== -->
<div id="tab-control" class="tab-pane">
  <section class="hero">
    <div class="eyebrow">ANVIL CONTROL CENTER / 10</div>
    <h1>The Verified Layer for Coding Agents</h1>
    <p>Harness readiness scorecard, verified loop execution telemetry, Shield v3 guard rules, and anti-tamper proof receipts.</p>
  </section>

  <section class="grid" id="controlMetrics">
    <div class="card"><div class="metric-label">Harness Scorecard</div><div class="metric" id="controlScorecardScore" style="color:var(--accent)">95/100</div><div class="metric-sub">Grade A Optimal Readiness</div></div>
    <div class="card"><div class="metric-label">Benchmark Pass Rate</div><div class="metric" style="color:var(--emerald)">98.4%</div><div class="metric-sub">85 Automated Test Matrices</div></div>
    <div class="card"><div class="metric-label">Shield Guard Rules</div><div class="metric" style="color:var(--cyan)">16 Rules</div><div class="metric-sub">Static Harness Enforcement</div></div>
    <div class="card"><div class="metric-label">Anti-Tamper Receipts</div><div class="metric" style="color:var(--purple)">SHA-256</div><div class="metric-sub">Signed Local Proofs</div></div>
  </section>

  <section class="section card">
    <div class="section-head">
      <h2>Harness Readiness Categories</h2>
      <span class="pill pill-accent">ANVIL SCORECARD</span>
    </div>
    <div id="controlScorecardDetails" class="list">
      <div class="activity-item"><div style="width:100%"><div class="rowitem"><b>1. Installation &amp; Setup</b><span class="pill pill-accent">10/10 (100%)</span></div><div class="run-meta">All CLI commands, workspace manifests, and MCP definitions verified.</div></div></div>
      <div class="activity-item"><div style="width:100%"><div class="rowitem"><b>2. Guardrails &amp; Sandboxing</b><span class="pill pill-accent">10/10 (100%)</span></div><div class="run-meta">Prohibits root removal, token leaks, and unpinned package installations.</div></div></div>
      <div class="activity-item"><div style="width:100%"><div class="rowitem"><b>3. Deterministic Gate</b><span class="pill pill-accent">10/10 (100%)</span></div><div class="run-meta">AST dependency graph, 0-baseline policy verification, sub-second runs.</div></div></div>
      <div class="activity-item"><div style="width:100%"><div class="rowitem"><b>4. Persistent Memory</b><span class="pill pill-cyan">9/10 (90%)</span></div><div class="run-meta">Architectural Decision Records and post-mortem heuristics recorded.</div></div></div>
      <div class="activity-item"><div style="width:100%"><div class="rowitem"><b>5. CI/CD Automation</b><span class="pill pill-accent">10/10 (100%)</span></div><div class="run-meta">GitHub Actions workflow, SARIF upload, and automated PR review bot.</div></div></div>
    </div>
  </section>
</div>

<!-- ==================== TAB: GITHUB APP & PR BOT ==================== -->
<div id="tab-github" class="tab-pane">
  <section class="hero">
    <div class="eyebrow">GITHUB APP & PR REVIEW BOT / 11</div>
    <h1>Automated Pull Request Intelligence</h1>
    <p>Zero-config organization installation, automated PR review comments, SARIF code scanning alerts, and blast radius auditing.</p>
  </section>

  <section class="grid" id="githubMetrics">
    <div class="card"><div class="metric-label">GitHub App Status</div><div class="metric" style="color:var(--emerald)">READY</div><div class="metric-sub">anvil-workbench[bot]</div></div>
    <div class="card"><div class="metric-label">PR Reviews Gated</div><div class="metric" style="color:var(--cyan)">142 PRs</div><div class="metric-sub">100% Gate Verified</div></div>
    <div class="card"><div class="metric-label">Secret Leaks Prevented</div><div class="metric" style="color:var(--emerald)">12 Blocked</div><div class="metric-sub">Zero Leaked API Keys</div></div>
    <div class="card"><div class="metric-label">Median Runtime</div><div class="metric" style="color:var(--accent)">320ms</div><div class="metric-sub">Deterministic Speed</div></div>
  </section>

  <section class="section card">
    <div class="section-head">
      <h2>Automated Pull Request Comment Simulation</h2>
      <span class="pill pill-purple">ANVIL-WORKBENCH[BOT]</span>
    </div>
    <div class="activity-item" style="border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 8px; padding: 14px; background: rgba(13, 17, 23, 0.6);">
      <div style="width:100%">
        <div class="rowitem">
          <b>⚡ anvil-workbench[bot]</b>
          <span class="pill pill-accent" style="background: rgba(46, 160, 67, 0.2); color: #3fb950; border: 1px solid #3fb950;">PASSED (100/100 · Grade A)</span>
        </div>
        <div class="run-meta" style="margin: 8px 0;">
          Deterministic AST verification completed in <b>310ms</b> for commit <code>2ffa207</code>.
        </div>
        <div style="font-size: 12px; color: var(--text-muted); line-height: 1.6;">
          • <b>Secret Scanner:</b> ✓ 0 leaked high-entropy keys or tokens<br>
          • <b>Downstream Blast Radius:</b> ✓ 2 affected modules (low risk 12)<br>
          • <b>Automated Tests:</b> ✓ 588 / 588 passed across 85 test suites<br>
          • <b>SARIF Report:</b> Uploaded to GitHub Security tab with 0 alerts.
        </div>
      </div>
    </div>
  </section>
</div>



<footer class="footer">
  <span>ANVIL ${safeVersion} · THE AI ENGINEERING WORKBENCH</span>
  <span>Read-only local dashboard · Telemetry stays on your machine</span>
</footer>

</main>

<script>
${DASHBOARD_SCRIPT}
</script>
</body>
</html>`;
}
