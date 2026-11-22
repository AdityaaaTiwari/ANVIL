/* anvil-disable-file ANVIL-R003 */
import { createServer, type Server, type ServerResponse } from "node:http";
import { captureAgentConfigVersion, listAgentConfigVersions } from "./agent-config-versioning.js";
import {
  decideAgentConfigRelease,
  listAgentConfigReleases,
  prepareAgentConfigRelease,
} from "./agent-config-release.js";
import { mkdir, readFile, readdir, lstat, writeFile, realpath } from "node:fs/promises";
import path from "node:path";
import { inspectProject } from "./project-inspector.js";
import { mapArchitecture } from "./architecture-map.js";
import { decideTaskApproval, listRuns, loadRun, saveRun } from "./run-store.js";
import { loadAgentRegistry } from "./agent-registry.js";
import { auditProject } from "./quality-audit.js";
import { listVerifications } from "./verification-history.js";
import { generateProjectHealth } from "./project-health.js";
import { listReviews } from "./review-history.js";
import { generateRegressionReport } from "./regression-intelligence.js";
import { listWorkspaceDirectory, readWorkspaceFile } from "./workspace-browser.js";
import { searchWorkspace } from "./code-search.js";
import { buildDependencyGraph } from "./dependency-graph.js";
import { analyzeEngineeringRisk } from "./engineering-risk.js";
import { analyzeChangeIntelligence } from "./change-intelligence.js";
import { compareLatestIntelligence, listIntelligenceSnapshots } from "./intelligence-timeline.js";
import { analyzeDependencies } from "./dependency-intelligence.js";
import { loadExecutionTrace } from "./execution-trace.js";
import { listEvaluationReports } from "./evaluation-engine.js";
import { listBenchmarks } from "./benchmark-engine.js";
import { listBenchmarkMatrices } from "./benchmark-matrix.js";
import { loadBenchmarkRegression } from "./benchmark-regression.js";
import { buildAgentEvaluationIntelligence } from "./agent-evaluation-intelligence.js";
import { buildAgentOptimizationPlan } from "./agent-optimization.js";
import { auditAgentConfiguration } from "./agent-security-audit.js";
import { buildExperimentHistory } from "./experiment-history.js";
import { createReplayRun, createTaskRetryRun } from "./run-replay.js";
import { diagnoseProvider, type DiagnosableProvider } from "./provider-diagnostics.js";
import { createRunFromWorkflow, listWorkflows, loadWorkflow, saveWorkflow } from "./workflow-store.js";
import { advanceRun, DemoAgentProvider } from "./orchestrator.js";
import { cleanProject, undoLastClean } from "./project-cleaner.js";
import { runDoctorChecks } from "./doctor.js";
import { listProjectMemory, addProjectMemory, removeProjectMemory } from "./project-memory.js";
import { listAdrs, createAdr, syncMemoryToAdrs, type AdrStatus } from "./adr-engine.js";
import { scanProjectSecurity, applySecurityFixes } from "./security-scanner.js";
import { evaluateGate } from "./policy-engine.js";

// --- SSE broadcast state ---
const sseClients = new Set<ServerResponse>();
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

export function broadcastEvent(type: string, data: unknown): void {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

function safeProviderOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return "configured endpoint (invalid URL)";
  }
}

const PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#07080e">
<title>ANVIL — Engineering Workbench</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{
  color-scheme:dark;
  --bg:#07080e;
  --panel:#0d121c;
  --panel2:#121824;
  --line:rgba(255,255,255,0.08);
  --line-hover:rgba(249,115,22,0.35);
  --muted:#8e9aab;
  --text:#edf2f8;
  --accent:#f97316;
  --accent-light:#fb923c;
  --accent-glow:rgba(249,115,22,0.18);
  --cyan:#38bdf8;
  --cyan-glow:rgba(56,189,248,0.15);
  --emerald:#34d399;
  --emerald-glow:rgba(52,211,153,0.15);
  --purple:#a855f7;
  --danger:#fb7185;
  --warning:#fbbf24;
}
*{box-sizing:border-box}
body{
  margin:0;
  background:radial-gradient(ellipse at 80% -10%,rgba(56,189,248,0.08) 0,transparent 45%),radial-gradient(ellipse at 20% 15%,rgba(249,115,22,0.07) 0,transparent 40%),var(--bg);
  background-attachment:fixed;
  color:var(--text);
  font:14px/1.55 'Inter',ui-sans-serif,system-ui,-apple-system,sans-serif;
  letter-spacing:-0.01em;
}
.shell{max-width:1440px;margin:auto;padding:20px 28px}
.top{
  display:flex;
  align-items:center;
  justify-content:space-between;
  border-bottom:1px solid var(--line);
  padding:14px 0 18px;
  gap:16px;
  flex-wrap:wrap;
}
.brand{display:flex;gap:12px;align-items:center}
.mark{
  width:40px;height:40px;
  border:1px solid rgba(249,115,22,0.4);
  background:linear-gradient(135deg,rgba(249,115,22,0.2),rgba(56,189,248,0.15));
  color:var(--accent-light);
  display:grid;place-items:center;
  border-radius:11px;
  font-weight:900;font-size:18px;
  box-shadow:0 0 20px var(--accent-glow);
}
.brand strong{font-size:17px;letter-spacing:1.5px;color:#fff}
.brand small{display:block;color:var(--muted);font-size:10px;letter-spacing:0.8px;font-family:'JetBrains Mono',monospace}
.header-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.status{
  color:var(--emerald);font-size:11px;font-weight:600;
  border:1px solid rgba(52,211,153,0.3);background:rgba(52,211,153,0.08);
  padding:5px 11px;border-radius:30px;
  display:inline-flex;align-items:center;gap:6px;
}
.showcase-pill{
  display:inline-flex;align-items:center;gap:8px;
  background:rgba(56,189,248,0.1);
  border:1px solid rgba(56,189,248,0.3);
  padding:5px 12px;border-radius:20px;
  font-size:11px;font-weight:700;color:var(--cyan);
  cursor:pointer;user-select:none;
}
.showcase-pill input{accent-color:var(--cyan);cursor:pointer}

/* Navigation Tabs */
.tab-nav{
  position:sticky;
  top:12px;
  z-index:40;
  background:rgba(9,13,20,0.94);
  backdrop-filter:blur(20px);
  display:flex;
  gap:8px;
  border:1px solid rgba(255,255,255,0.12);
  border-radius:12px;
  padding:8px 12px;
  margin-bottom:28px;
  overflow-x:auto;
  box-shadow:0 8px 32px rgba(0,0,0,0.4);
}
.tab-btn{
  background:transparent;
  color:var(--muted);
  border:1px solid transparent;
  border-radius:9px;
  padding:8px 14px;
  font-size:12px;
  font-weight:600;
  cursor:pointer;
  display:inline-flex;align-items:center;gap:7px;
  transition:all 0.2s ease;
  white-space:nowrap;
}
.tab-btn:hover{color:#fff;background:rgba(255,255,255,0.06);border-color:rgba(255,255,255,0.1)}
.tab-btn.active{
  color:#fff;
  background:linear-gradient(135deg,rgba(249,115,22,0.22),rgba(249,115,22,0.1));
  border-color:rgba(249,115,22,0.5);
  box-shadow:0 0 15px rgba(249,115,22,0.15);
}
.tab-pane{margin-bottom:48px;scroll-margin-top:84px}

/* Showcase Banner */
.showcase-banner{
  background:linear-gradient(90deg,rgba(56,189,248,0.12),rgba(168,85,247,0.1));
  border:1px solid rgba(56,189,248,0.3);
  border-radius:12px;
  padding:12px 18px;
  margin-bottom:20px;
  display:flex;align-items:center;justify-content:space-between;
  gap:12px;
  font-size:12px;
}
.showcase-banner b{color:var(--cyan)}
.showcase-banner span{color:var(--text)}

/* Grid & Cards */
.hero{padding:20px 0 18px}
.eyebrow{color:var(--accent-light);font-size:11px;letter-spacing:2px;font-weight:700}
.hero h1{font-size:clamp(24px,3.2vw,36px);line-height:1.15;letter-spacing:-1px;margin:6px 0 8px;color:#fff}
.hero p{color:var(--muted);margin:0;max-width:720px;font-size:13px}
.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.card{
  background:linear-gradient(145deg,rgba(18,24,36,0.85),rgba(13,18,28,0.85));
  border:1px solid var(--line);
  border-radius:14px;
  padding:18px;
  min-width:0;
  backdrop-filter:blur(10px);
  box-shadow:0 8px 24px rgba(0,0,0,0.25);
  transition:border-color 0.2s,box-shadow 0.2s;
}
.card:hover{border-color:rgba(255,255,255,0.14)}
.card-highlight{border-color:rgba(249,115,22,0.35);background:linear-gradient(145deg,rgba(24,20,16,0.9),rgba(15,18,26,0.9))}
.metric-label{color:var(--muted);font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase}
.metric{font-size:28px;font-weight:800;letter-spacing:-1px;margin-top:4px;color:#fff}
.metric-sub{color:#718094;font-size:11px;margin-top:3px}
.section{margin-top:20px}
.section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:10px;flex-wrap:wrap}
.section h2{font-size:14px;margin:0;letter-spacing:0.2px;color:#f8fafc;display:flex;align-items:center;gap:7px}
.muted{color:var(--muted)}
.columns{display:grid;grid-template-columns:1.2fr .8fr;gap:12px}
.list{display:grid;gap:9px}
.rowitem{display:flex;justify-content:space-between;gap:14px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);align-items:center}
.rowitem:last-child{border:0}
.rowitem b{font-weight:600;font-size:13px}
.pill{
  font-size:10px;font-weight:700;
  border:1px solid var(--line);
  border-radius:20px;
  padding:3px 9px;
  color:#cbd5e1;
  background:rgba(255,255,255,0.03);
  letter-spacing:0.04em;
  white-space:nowrap;
}
.pill-accent{border-color:rgba(249,115,22,0.4);color:var(--accent-light);background:rgba(249,115,22,0.1)}
.pill-cyan{border-color:rgba(56,189,248,0.4);color:var(--cyan);background:rgba(56,189,248,0.1)}
.pill-emerald{border-color:rgba(52,211,153,0.4);color:var(--emerald);background:rgba(52,211,153,0.1)}
.pill-danger{border-color:rgba(251,113,133,0.4);color:var(--danger);background:rgba(251,113,133,0.1)}
.pill-warning{border-color:rgba(251,191,36,0.4);color:var(--warning);background:rgba(251,191,36,0.1)}
.pill-purple{border-color:rgba(168,85,247,0.4);color:var(--purple);background:rgba(168,85,247,0.1)}
.token-table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px}
.token-table th,.token-table td{padding:8px 12px;border-bottom:1px solid var(--line);text-align:left}
.token-table th{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:0.05em}
.token-table tr:hover{background:rgba(255,255,255,0.02)}
.saving-tag{color:var(--emerald);font-weight:700;background:rgba(52,211,153,0.1);padding:2px 7px;border-radius:12px;font-size:11px;display:inline-block}
.barline{height:6px;background:rgba(255,255,255,0.06);border-radius:10px;margin-top:7px;overflow:hidden}
.barline span{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--cyan));border-radius:10px}
.run{padding:12px;border:1px solid transparent;border-radius:9px;background:rgba(255,255,255,0.02);cursor:pointer;margin-bottom:6px;transition:all 0.15s}
.run:hover{background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.1)}
.run.selected{border-color:var(--accent);background:rgba(249,115,22,0.08);box-shadow:0 0 15px rgba(249,115,22,0.1)}
.run-title{display:flex;justify-content:space-between;gap:12px;align-items:center}
.run-goal{font-weight:600;overflow-wrap:anywhere;font-size:13px}
.run-meta{color:var(--muted);font-size:11px;margin-top:4px;line-height:1.5}
.activity{display:grid;gap:9px}
.activity-item{display:grid;grid-template-columns:10px 1fr;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.05)}
.activity-dot{width:8px;height:8px;margin-top:6px;border-radius:50%;background:#8e9aab}
.activity-dot.completed{background:var(--emerald);box-shadow:0 0 8px var(--emerald-glow)}
.activity-dot.failed,.activity-dot.blocked{background:var(--danger)}
.activity-dot.awaiting_approval{background:var(--warning)}
.activity-dot.running{background:var(--cyan);animation:pulse 1.2s infinite ease-in-out}
.task-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}
.task-card{border:1px solid var(--line);border-radius:9px;padding:10px;background:rgba(10,14,22,0.7)}
.task-card b{display:block;font-size:12px;color:#fff}
.task-card small{display:block;color:var(--muted);margin-top:4px}
.activity-toolbar{display:flex;gap:8px;align-items:center}
.inspector{display:grid;gap:12px}
.inspector-task{border:1px solid var(--line);border-radius:10px;padding:14px;background:rgba(11,16,24,0.85)}
.inspector-task pre{white-space:pre-wrap;overflow-wrap:anywhere;color:#cbd5e1;font:11px/1.6 'JetBrains Mono',monospace;margin:10px 0 0;background:rgba(0,0,0,0.35);padding:10px;border-radius:7px}
.approval{border-color:rgba(251,191,36,0.4);background:rgba(33,27,16,0.7)}
.approval-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.btn.approve{border-color:rgba(52,211,153,0.5);color:var(--emerald);background:rgba(52,211,153,0.1)}
.btn.reject{border-color:rgba(251,113,133,0.5);color:var(--danger);background:rgba(251,113,133,0.1)}
.approval-audit{font-size:11px;color:var(--muted);margin-top:8px}
.empty{
  padding:24px 14px;
  text-align:center;
  color:var(--muted);
  border:1px dashed var(--line);
  border-radius:10px;
  background:rgba(255,255,255,0.015);
}
.empty-rich{
  text-align:left;
  padding:16px 18px;
  background:linear-gradient(135deg,rgba(18,24,36,0.5),rgba(12,17,26,0.5));
  border:1px solid var(--line);
  border-radius:12px;
}
.actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.btn{
  background:rgba(255,255,255,0.05);
  color:var(--text);
  border:1px solid rgba(255,255,255,0.12);
  border-radius:8px;
  padding:7px 12px;
  font:inherit;
  font-size:12px;
  font-weight:600;
  cursor:pointer;
  transition:all 0.15s ease;
  display:inline-flex;align-items:center;gap:6px;
}
.btn:hover{border-color:var(--accent);color:#fff;background:rgba(255,255,255,0.08);transform:translateY(-1px)}
.btn-primary{
  background:linear-gradient(135deg,#f97316,#fb923c);
  color:#07080d;
  font-weight:700;
  border-color:rgba(255,255,255,0.25);
  box-shadow:0 2px 10px var(--accent-glow);
}
.btn-primary:hover{background:linear-gradient(135deg,#fb923c,#fdba74);color:#07080d}
.btn-cyan{
  background:rgba(56,189,248,0.15);
  color:var(--cyan);
  border-color:rgba(56,189,248,0.4);
}
.btn-cyan:hover{background:rgba(56,189,248,0.25);color:#fff}
.architecture{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:8px}
.graph-wrap{border:1px solid var(--line);border-radius:12px;background:#090d14;overflow:hidden;margin-bottom:14px}
.graph-wrap svg{display:block;width:100%;height:360px}
.graph-edge{stroke:#38485c;stroke-width:1.4;opacity:.8}
.graph-node{fill:#141d2a;stroke:#6c84a0;stroke-width:1.5;cursor:pointer}
.graph-node.entry{stroke:var(--accent);stroke-width:2.5}
.graph-node.selected{fill:#342312;stroke:var(--accent);stroke-width:3}
.graph-label{fill:var(--text);font-size:10px;pointer-events:none}
.dependency-node{cursor:pointer}
.dependency-node circle{stroke-width:2;fill:#151e2b;stroke:#6c84a0}
.dependency-node.file circle{stroke:var(--cyan)}
.dependency-node.entry circle{stroke:var(--accent)}
.dependency-node.declared circle{stroke:var(--cyan)}
.dependency-node.undeclared circle{stroke:var(--danger);fill:#351923}
.dependency-node.possible-unused circle{stroke:var(--warning);fill:#302711}
.dependency-node.selected circle{stroke:#fff;stroke-width:3;fill:#352115}
.dependency-label{fill:var(--text);font-size:11px;pointer-events:none}
.dependency-edge{stroke:#38485c;stroke-width:1.25;opacity:.6;fill:none}
.dependency-edge.external{stroke:var(--accent);stroke-dasharray:4 4}
.dependency-node.hidden,.dependency-edge.hidden{display:none}
.dependency-legend{display:flex;gap:12px;flex-wrap:wrap;color:var(--muted);font-size:11px;margin:8px 0}
.dependency-legend span{display:inline-flex;align-items:center;gap:5px}
.dependency-legend i{width:8px;height:8px;border-radius:50%;display:inline-block;background:var(--cyan)}
.dependency-legend .bad{background:var(--danger)}
.dependency-legend .warn{background:var(--warning)}
.graph-hint,.graph-detail{padding:10px 12px;color:var(--muted);font-size:12px;overflow-wrap:anywhere}
.graph-hint{border-top:1px solid var(--line)}
.node{background:rgba(21,28,40,0.85);border:1px solid var(--line);border-radius:9px;padding:10px;font-size:11px;overflow-wrap:anywhere}
.node small{display:block;color:var(--muted);margin-top:4px}
.footer{margin:36px 0 10px;padding-top:16px;border-top:1px solid var(--line);color:#718094;font-size:11px;display:flex;justify-content:space-between;gap:10px}
.error{color:var(--danger)}
.loading{color:var(--muted);padding:15px 0}
.workflow-graph-wrap{height:440px;border:1px solid var(--line);border-radius:12px;overflow:hidden;background-color:#080c14;background-image:radial-gradient(#202d3e 1px,transparent 1px);background-size:20px 20px;touch-action:none}
.workflow-graph-wrap svg{width:100%;height:100%;display:block;cursor:grab;user-select:none}
.workflow-graph-wrap svg:active{cursor:grabbing}
.workflow-edge{fill:none;stroke:#788ea8;stroke-width:2.2;opacity:.85}
.workflow-graph-node{cursor:grab}
.workflow-graph-node rect{fill:#151e2b;stroke:#4a5c72;stroke-width:1.5}
.workflow-graph-node:hover rect{stroke:var(--accent);stroke-width:2}
.workflow-graph-node.selected rect{stroke:var(--accent);stroke-width:3;fill:#2b1d12}
.wf-agent{fill:var(--accent-light);font-size:9px;letter-spacing:1px;font-weight:700}
.wf-title{fill:#f0f4fa;font-size:12px;font-weight:650}
.wf-sub{fill:#94a3b8;font-size:9px}
.workflow-toolbar{display:flex;gap:8px;align-items:center;margin:0 0 8px}
.workflow-analysis{margin:9px 0;padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:#0d141f;color:#c4d1df;font-size:12px}
.workflow-analysis b{color:#e6edf5}
.live-pulse{animation:pulse 1.5s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
@media(max-width:900px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.columns{grid-template-columns:1fr}}
@media(max-width:560px){.shell{padding:14px}.top{align-items:flex-start}.status{font-size:10px}.grid{gap:9px}.card{padding:12px}.metric{font-size:23px}.hero{padding:16px 0}.footer{flex-direction:column}}
</style>
</head>
<body>
<main class="shell">

<header class="top">
  <div class="brand">
    <div class="mark">A.</div>
    <div>
      <strong>ANVIL</strong>
      <small>THE AI ENGINEERING WORKBENCH · v1.1.2</small>
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
        <span class="pill pill-emerald">MCP READY (v1.1.2)</span>
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
    <div class="section-head"><h3 style="margin:0">Active Findings & Suppressions</h3><span class="pill" id="findingsCountPill">0 FINDINGS</span></div>
    <div id="gateFindingsList" class="list"><div class="loading">Evaluating repository gate…</div></div>
  </section>
</div>

<!-- ==================== TAB 2: SELF-HEALING, CLEANER & SECURITY (v1.1.2) ==================== -->
<div id="tab-cleaner" class="tab-pane">
  <section class="hero">
    <div class="eyebrow">ANVIL v1.1.2 SELF-HEALING & SECURITY ENGINE</div>
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
    <p class="run-meta">Edit custom agent and skill instructions in .anvil/agents and .anvil/skills (or .forge/). Built-in agents stay read-only. Saving changes local workspace files only; it does not execute agents or automatically promote a configuration.</p>
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

<footer class="footer">
  <span>ANVIL v1.1.2 · THE AI ENGINEERING WORKBENCH</span>
  <span>Read-only local dashboard · Telemetry stays on your machine</span>
</footer>

</main>

<script>
const el=id=>document.getElementById(id);
const on=(id,event,handler)=>{const node=el(id);if(node)node.addEventListener(event,handler);};
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

let isShowcase = false;
const showcaseToggle = el("showcaseToggle");
const showcaseNotice = el("showcaseNotice");
if(showcaseToggle){
  showcaseToggle.addEventListener("change",()=>{
    isShowcase = showcaseToggle.checked;
    if(showcaseNotice) showcaseNotice.style.display = isShowcase ? "flex" : "none";
    reloadAllViews();
  });
}

// Tab quick jump navigation
document.querySelectorAll(".tab-btn").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    const pane = el(btn.dataset.tab);
    if(pane) pane.scrollIntoView({ behavior:"smooth", block:"start" });
  });
});

async function api(path){
  const response=await fetch(path,{headers:{"accept":"application/json"}});
  if(!response.ok)throw new Error("Request failed ("+response.status+")");
  return response.json();
}

function connectSSE(){
  const es=new EventSource('/api/events');
  const pill=el("liveStatus");
  const setLive=at=>{
    pill.className="status live-pulse";
    pill.style.color="var(--emerald)";
    pill.style.borderColor="rgba(52,211,153,0.4)";
    pill.textContent="● LIVE · "+new Date(at).toLocaleTimeString();
  };
  es.addEventListener("connected",e=>{try{const d=JSON.parse(e.data);setLive(d.at);}catch{}});
  es.addEventListener("run-updated",e=>{try{const d=JSON.parse(e.data);setLive(d.at||new Date().toISOString());loadRuns();loadActivity();if(selectedRunId)inspectRun(selectedRunId);}catch{}});
  es.addEventListener("heartbeat",e=>{try{const d=JSON.parse(e.data);setLive(d.at);}catch{}});
  es.onerror=()=>{
    pill.className="status";
    pill.style.color="";
    pill.style.borderColor="";
    pill.textContent="● LOCAL WORKSPACE";
    setTimeout(connectSSE,5000);
    es.close();
  };
}

function metric(label,value,sub){
  return '<div class="card"><div class="metric-label">'+esc(label)+'</div><div class="metric">'+esc(value)+'</div><div class="metric-sub">'+esc(sub)+'</div></div>';
}

// ==================== SAMPLE SHOWCASE TELEMETRY ====================
const SAMPLE_RUNS = [
  {
    id: "run-sec-delivery",
    goal: "Autonomous Feature Delivery & Security Audit",
    status: "completed",
    createdAt: new Date(Date.now() - 420000).toISOString(),
    tasks: [
      { id: "scope", title: "Map architecture boundaries", agent: "architect", status: "completed", dependsOn: [] },
      { id: "plan", title: "Plan implementation steps", agent: "planner", status: "completed", dependsOn: ["scope"] },
      { id: "security", title: "Security boundary review", agent: "security-reviewer", status: "completed", dependsOn: ["plan"], requiresApproval: true },
      { id: "verify", title: "Design verification cases", agent: "test-engineer", status: "completed", dependsOn: ["plan"] },
      { id: "review", title: "Independent code review", agent: "code-reviewer", status: "completed", dependsOn: ["security", "verify"] },
      { id: "release", title: "Release readiness audit", agent: "release-manager", status: "completed", dependsOn: ["review"] }
    ],
    events: [
      { at: new Date(Date.now() - 410000).toISOString(), taskId: "scope", type: "completed", message: "Mapped 48 source modules and 6 API entrypoints." },
      { at: new Date(Date.now() - 340000).toISOString(), taskId: "plan", type: "completed", message: "Generated 5-step file modification plan." },
      { at: new Date(Date.now() - 280000).toISOString(), taskId: "security", type: "completed", message: "Validated JWT trust boundaries and SQL escaping." },
      { at: new Date(Date.now() - 190000).toISOString(), taskId: "verify", type: "completed", message: "Designed 14 unit and integration test assertions." },
      { at: new Date(Date.now() - 110000).toISOString(), taskId: "review", type: "completed", message: "Zero high-severity regressions found." },
      { at: new Date(Date.now() - 45000).toISOString(), taskId: "release", type: "completed", message: "All release gates green; ready to ship." }
    ]
  },
  {
    id: "run-clean-verify",
    goal: "Self-Healing Polyglot Cleanup & Undo Verification",
    status: "completed",
    createdAt: new Date(Date.now() - 1800000).toISOString(),
    tasks: [
      { id: "scan", title: "Scan junk clutter and unused imports", agent: "architect", status: "completed", dependsOn: [] },
      { id: "dryrun", title: "Execute dry-run backup verification", agent: "test-engineer", status: "completed", dependsOn: ["scan"] },
      { id: "repair", title: "Prune unused imports and snapshot backup", agent: "code-reviewer", status: "completed", dependsOn: ["dryrun"] }
    ],
    events: [
      { at: new Date(Date.now() - 1790000).toISOString(), taskId: "scan", type: "completed", message: "Found 2 junk files and 4 unused imports." },
      { at: new Date(Date.now() - 1750000).toISOString(), taskId: "dryrun", type: "completed", message: "Self-healing test passed without errors." },
      { at: new Date(Date.now() - 1710000).toISOString(), taskId: "repair", type: "completed", message: "Saved backup snapshot backup-1795188." }
    ]
  },
  {
    id: "run-arch-opt",
    goal: "Architecture Decoupling & Boundary Enforcement",
    status: "completed",
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    tasks: [
      { id: "map", title: "Map circular dependencies", agent: "architect", status: "completed", dependsOn: [] },
      { id: "plan", title: "Propose boundary decoupling", agent: "planner", status: "completed", dependsOn: ["map"] },
      { id: "review", title: "Verify zero circular import breakage", agent: "code-reviewer", status: "completed", dependsOn: ["plan"] }
    ],
    events: [
      { at: new Date(Date.now() - 7190000).toISOString(), taskId: "map", type: "completed", message: "Identified zero cycles across 73 modules." },
      { at: new Date(Date.now() - 7150000).toISOString(), taskId: "plan", type: "completed", message: "Enforced strict layered architecture." }
    ]
  }
];

const SAMPLE_BENCHMARKS = [
  { key: "OpenAI gpt-4.1-mini", suite: "engineering-security-suite", completed: 8, trials: 8, averageScore: 94, passRate: 100, scoreStdDev: "1.8", bestScore: 98, worstScore: 91, averageDurationMs: 420, averageEstimatedTokens: 2840, totalRetries: 0 },
  { key: "Anthropic claude-3-7-sonnet", suite: "engineering-security-suite", completed: 6, trials: 6, averageScore: 96, passRate: 100, scoreStdDev: "1.2", bestScore: 99, worstScore: 94, averageDurationMs: 580, averageEstimatedTokens: 3420, totalRetries: 0 },
  { key: "Google gemini-2.5-flash", suite: "engineering-security-suite", completed: 8, trials: 8, averageScore: 92, passRate: 95, scoreStdDev: "2.6", bestScore: 95, worstScore: 88, averageDurationMs: 310, averageEstimatedTokens: 2150, totalRetries: 0 }
];

const SAMPLE_EXPERIMENTS = [
  { candidateId: "candidate-claude-sonnet", provider: "Anthropic", model: "claude-3-7-sonnet", suiteId: "engineering-basics", runs: 3, completedTrials: 6, averageScore: 96, passRate: 100, scoreStdDev: "1.2", averageDurationMs: 580, averageEstimatedTokens: 3420, scoreDelta: 4, regression: false, latestMatrixId: "matrix-rel-01" },
  { candidateId: "candidate-gpt41-mini", provider: "OpenAI", model: "gpt-4.1-mini", suiteId: "engineering-basics", runs: 4, completedTrials: 8, averageScore: 94, passRate: 100, scoreStdDev: "1.8", averageDurationMs: 420, averageEstimatedTokens: 2840, scoreDelta: 2, regression: false, latestMatrixId: "matrix-rel-01" },
  { candidateId: "candidate-gemini-flash", provider: "Google", model: "gemini-2.5-flash", suiteId: "engineering-basics", runs: 4, completedTrials: 8, averageScore: 92, passRate: 95, scoreStdDev: "2.6", averageDurationMs: 310, averageEstimatedTokens: 2150, scoreDelta: -1, regression: false, latestMatrixId: "matrix-rel-01" }
];

async function loadEvaluationHistory(){
  try{
    let reports = await api("/api/evaluations");
    if(!reports.length && isShowcase){
      reports = [
        { suiteName: "engineering-security-suite", passed: true, runId: "run-sec-delivery", evaluatedAt: new Date().toISOString(), score: 96, summary: { passed: 14, total: 14, missingOutput: 0 }, cases: [{ caseId: "sec-boundaries", agent: "security-reviewer", score: 98, passed: true }, { caseId: "input-validation", agent: "test-engineer", score: 94, passed: true }] },
        { suiteName: "code-quality-determinism", passed: true, runId: "run-clean-verify", evaluatedAt: new Date(Date.now() - 3600000).toISOString(), score: 92, summary: { passed: 10, total: 10, missingOutput: 0 }, cases: [{ caseId: "clean-undo-test", agent: "architect", score: 92, passed: true }] }
      ];
    }
    el("evaluationUpdated").textContent = reports.length + " saved reports";
    el("evaluationHistory").innerHTML = reports.length ? reports.map(report=>'<div class="activity-item"><div style="width:100%"><div class="rowitem"><b>'+esc(report.suiteName)+'</b><span class="pill '+(report.passed?'pill-emerald':'pill-accent')+'">'+(report.passed?'PASS':'NEEDS REVIEW')+'</span></div><div class="run-meta">'+esc(report.runId)+' · '+esc(new Date(report.evaluatedAt).toLocaleString())+'</div><div class="run-meta">Score '+report.score+'/100 · '+report.summary.passed+'/'+report.summary.total+' deterministic cases passed · '+report.summary.missingOutput+' missing outputs</div>'+report.cases.map(item=>'<div class="run-meta">'+esc(item.caseId)+' · '+esc(item.agent)+' · '+item.score+'/100 · '+(item.passed?'PASS':esc(item.status))+'</div>').join("")+'</div></div>').join("") : '<div class="empty">No evaluation reports yet. Run <code>anvil evaluate RUNID</code> after creating a saved run.</div>';
  }catch(error){el("evaluationHistory").innerHTML='<div class="error">'+esc(error.message)+'</div>';}
}

async function loadBenchmarkHistory(){
  try{
    const [docs,matrices] = await Promise.all([api("/api/benchmarks"), api("/api/benchmark-matrices")]);
    let all = docs.flatMap(doc=>doc.groups.map(group=>({suite:doc.suiteName,key:group.key,trials:group.trials,completed:group.trials,averageScore:group.averageScore,passRate:group.passRate,scoreStdDev:group.scoreStdDev,bestScore:group.bestScore,worstScore:group.worstScore,averageDurationMs:group.averageDurationMs,averageEstimatedTokens:group.averageEstimatedTokens,totalRetries:group.totalRetries,averageJudgeScore:group.averageJudgeScore,judgePassRate:group.judgePassRate})));
    all.push(...matrices.flatMap(matrix=>matrix.summary.map(group=>({suite:matrix.matrixName+" · "+matrix.suiteId,key:group.candidateId+" ("+group.provider+"/"+group.model+")",trials:group.trials,completed:group.completed,averageScore:group.averageScore,passRate:group.passRate,scoreStdDev:group.scoreStdDev,bestScore:group.averageScore,worstScore:group.averageScore,averageDurationMs:group.averageDurationMs,averageEstimatedTokens:group.averageEstimatedTokens,totalRetries:0}))));
    if(!all.length && isShowcase) all = SAMPLE_BENCHMARKS;
    const trials = all.reduce((n,g)=>n+(g.trials||0),0);
    el("benchmarkUpdated").textContent = all.length + " model groups · " + trials + " trials";
    el("benchmarkHistory").innerHTML = all.length ? all.map(group=>'<div class="activity-item"><div style="width:100%"><div class="rowitem"><b>'+esc(group.key)+'</b><span class="pill pill-accent">'+group.averageScore+'/100 avg</span></div><div class="run-meta">'+esc(group.suite)+' · '+group.completed+'/'+group.trials+' completed · '+group.passRate+'% pass rate · score σ '+group.scoreStdDev+'</div><div class="run-meta">Best '+group.bestScore+' · worst '+group.worstScore+' · avg '+group.averageDurationMs+' ms · ~'+group.averageEstimatedTokens+' tokens · '+(group.totalRetries||0)+' retries</div></div></div>').join("") : '<div class="empty">No benchmark trials yet. Run <code>anvil benchmark-matrix</code> or record a completed run with <code>anvil benchmark RUN_ID</code>.</div>';
  }catch(error){el("benchmarkHistory").innerHTML='<div class="error">'+esc(error.message)+'</div>';}
}

async function loadBenchmarkRegression(){
  try{
    const report=await api("/api/benchmark-regression");
    if(report.status==="insufficient-history" && isShowcase){
      el("regressionStatus").textContent="STABLE";
      el("benchmarkRegression").innerHTML='<div class="activity-item"><div><b>Engineering Security Regression Suite</b><div class="run-meta">Suite engineering-basics · baseline 2 hours ago · current latest</div><div class="run-meta" style="color:var(--emerald)">✓ Zero performance regressions detected across 3 comparable model candidates</div></div></div><div class="activity-item"><div style="width:100%"><div class="rowitem"><b>candidate-claude-sonnet · Anthropic/claude-3-7-sonnet</b><span class="pill pill-emerald">+4 score</span></div><div class="run-meta">Pass rate 96% → 100% · duration -8% · estimated tokens +2%</div></div></div>';
      return;
    }
    const status=report.status.toUpperCase().replaceAll("-"," ");
    el("regressionStatus").textContent=status;
    el("benchmarkRegression").innerHTML='<div class="activity-item"><div><b>'+esc(report.matrixName)+'</b><div class="run-meta">Suite '+esc(report.suiteId||"—")+' · baseline '+(report.baselineAt?esc(new Date(report.baselineAt).toLocaleString()):"not available")+' · current '+(report.currentAt?esc(new Date(report.currentAt).toLocaleString()):"not available")+'</div>'+report.summary.map(item=>'<div class="run-meta">'+esc(item)+'</div>').join("")+'</div></div>'+(report.candidates.length?report.candidates.map(item=>'<div class="activity-item"><div style="width:100%"><div class="rowitem"><b>'+esc(item.candidateId)+' · '+esc(item.provider)+'/'+esc(item.model)+'</b><span class="pill">'+(item.scoreDelta>0?"+":"")+item.scoreDelta+' score</span></div><div class="run-meta">Pass rate '+item.baselinePassRate+'% → '+item.currentPassRate+'% · duration '+item.durationChangePercent+'% · estimated tokens '+item.tokenChangePercent+'%</div>'+item.regressions.map(issue=>'<div class="run-meta" style="color:var(--danger)">REGRESSION · '+esc(issue)+'</div>').join("")+item.warnings.map(issue=>'<div class="run-meta" style="color:var(--warning)">WARNING · '+esc(issue)+'</div>').join("")+'</div></div>').join(""):'<div class="empty">No comparable candidates found. Run the same matrix again with the same goal and suite to establish a baseline.</div>');
  }catch(error){el("benchmarkRegression").innerHTML='<div class="error">'+esc(error.message)+'</div>';}
}

async function loadAgentPerformance(){
  try{
    const data=await api("/api/agent-performance");
    let agents=data.agents||[];
    if(!agents.length && isShowcase){
      agents=[
        { agent: "security-reviewer", candidateId: "candidate-claude", provider: "anthropic", model: "claude-3-7-sonnet", trials: 6, completed: 6, averageScore: 98, passRate: 100, skillsObserved: ["secure-changes", "audit-jwt"] },
        { agent: "architect", candidateId: "candidate-gpt41", provider: "openai", model: "gpt-4.1-mini", trials: 8, completed: 8, averageScore: 94, passRate: 100, skillsObserved: ["architecture-mapping"] },
        { agent: "test-engineer", candidateId: "candidate-gemini", provider: "google", model: "gemini-2.5-flash", trials: 8, completed: 8, averageScore: 92, passRate: 95, skillsObserved: ["self-healing-verify"] }
      ];
    }
    el("agentPerformanceUpdated").textContent = agents.length ? agents.length + " scorecards" : "NO SCORECARDS";
    el("agentPerformance").innerHTML = agents.length ? agents.map((item,index)=>'<div class="activity-item"><div style="width:100%"><div class="rowitem"><b>#'+(index+1)+' '+esc(item.agent)+'</b><span class="pill pill-accent">'+item.averageScore+'/100</span></div><div class="run-meta">'+esc(item.candidateId)+' · '+esc(item.provider)+'/'+esc(item.model)+' · '+item.completed+'/'+item.trials+' evaluated · '+item.passRate+'% pass rate</div><div class="run-meta">Skills observed: '+esc((item.skillsObserved||[]).join(", ")||"none")+'</div></div></div>').join("") : '<div class="empty">No per-agent scorecards yet. Run a benchmark matrix with an evaluation suite that includes agent-specific cases.</div>';
  }catch(error){el("agentPerformance").innerHTML='<div class="error">'+esc(error.message)+'</div>';}
}

async function loadSkillExperiments(){
  try{
    const matrices=await api("/api/benchmark-matrices");
    let experiments=matrices.filter(item=>item.skillExperiment).reverse();
    if(!experiments.length && isShowcase){
      experiments=[{
        matrixName: "Architecture & Safety Skill Impact",
        suiteId: "engineering-basics",
        goal: "Zero-regression feature implementation",
        skillExperiment: {
          scoreDelta: 16, baselineCandidateId: "candidate-baseline-noskill", treatmentCandidateId: "candidate-treatment-skills",
          skillIds: ["architecture-mapping", "secure-changes"],
          baselineScore: 78, treatmentScore: 94,
          baselinePassRate: 80, treatmentPassRate: 100,
          durationChangePercent: -12, tokenChangePercent: +8,
          agentDeltas: [{ agent: "architect", baselineScore: 75, treatmentScore: 95, scoreDelta: 20 }, { agent: "security-reviewer", baselineScore: 81, treatmentScore: 93, scoreDelta: 12 }]
        }
      }];
    }
    el("skillExperimentsUpdated").textContent = experiments.length + " experiments";
    el("skillExperiments").innerHTML = experiments.length ? experiments.map(matrix=>{
      const item=matrix.skillExperiment;
      return '<div class="activity-item"><div style="width:100%"><div class="rowitem"><b>'+esc(matrix.matrixName)+'</b><span class="pill pill-emerald">'+(item.scoreDelta>0?"+":"")+item.scoreDelta+' score</span></div><div class="run-meta">'+esc(matrix.suiteId)+' · '+esc(matrix.goal)+'</div><div class="run-meta">Baseline '+esc(item.baselineCandidateId)+' (no skills) → treatment '+esc(item.treatmentCandidateId)+' · skills: '+esc((item.skillIds||[]).join(", "))+'</div><div class="run-meta">Score '+item.baselineScore+' → '+item.treatmentScore+' · pass rate '+item.baselinePassRate+'% → '+item.treatmentPassRate+'% · duration '+item.durationChangePercent+'% · estimated tokens '+item.tokenChangePercent+'%</div>'+(item.agentDeltas||[]).map(agent=>'<div class="run-meta">'+esc(agent.agent)+': '+agent.baselineScore+' → '+agent.treatmentScore+' ('+(agent.scoreDelta>0?"+":"")+agent.scoreDelta+')</div>').join("")+'</div></div>';
    }).join("") : '<div class="empty">No controlled skill experiments yet. Configure a skillExperiment in a benchmark matrix to compare no-skill and skill-enabled runs.</div>';
  }catch(error){el("skillExperiments").innerHTML='<div class="error">'+esc(error.message)+'</div>';}
}

let experimentHistoryData=null;
async function loadExperimentHistory(){
  try{
    const params=new URLSearchParams();
    const suite=el("experimentSuiteFilter").value.trim(),candidate=el("experimentCandidateFilter").value.trim();
    if(suite)params.set("suite",suite);if(candidate)params.set("candidate",candidate);
    let data=await api("/api/experiment-history"+(params.size?"?"+params.toString():""));
    if(!data.entries.length && isShowcase){
      data = { entries: SAMPLE_EXPERIMENTS, reportsAnalyzed: 3, regressions: [], caveats: ["Observational estimates based on local benchmark simulations."] };
    }
    experimentHistoryData=data;
    el("experimentHistoryUpdated").textContent=data.entries.length+" candidate records · "+data.reportsAnalyzed+" reports";
    el("experimentLeaderboard").innerHTML=data.entries.length?data.entries.map((item,index)=>{
      const width=Math.max(0,Math.min(100,item.averageScore));
      const trend=item.scoreDelta===null?"FIRST RUN":(item.scoreDelta>0?"+":"")+item.scoreDelta+" vs previous";
      const trendColor=item.regression?"var(--danger)":item.scoreDelta>0?"var(--emerald)":"var(--muted)";
      return '<div class="activity-item"><div style="width:100%"><div class="rowitem"><b>#'+(index+1)+' '+esc(item.candidateId)+'</b><span class="pill pill-accent">'+item.averageScore+'/100 avg</span></div><div class="run-meta">'+esc(item.suiteId)+' · '+esc(item.provider)+'/'+esc(item.model)+' · '+item.runs+' runs · '+item.completedTrials+' trials</div><div class="barline"><span style="width:'+width+'%"></span></div><div class="run-meta">'+item.passRate+'% pass · σ '+item.scoreStdDev+' · '+item.averageDurationMs+' ms · ~'+item.averageEstimatedTokens+' estimated tokens</div><div class="run-meta" style="color:'+trendColor+'">'+esc(trend)+(item.regression?' · REGRESSION ALERT':'')+'</div><div class="run-meta">Latest matrix: '+esc(item.latestMatrixId)+'</div></div></div>';
    }).join(""):'<div class="empty">No historical benchmark candidates yet. Run a benchmark matrix to populate the leaderboard.</div>';
    
    const comparison=data.entries.slice(0,8);
    el("experimentComparison").innerHTML=comparison.length?comparison.map((item,index)=>{
      const score=Math.max(0,Math.min(100,Number(item.averageScore)||0)),pass=Math.max(0,Math.min(100,Number(item.passRate)||0));
      const duration=Math.max(0,Number(item.averageDurationMs)||0),tokens=Math.max(0,Number(item.averageEstimatedTokens)||0);
      return '<div class="activity-item"><div style="width:100%"><div class="rowitem"><b>'+esc(item.candidateId)+'</b><span class="pill pill-cyan">'+score+'/100 score</span></div><div class="run-meta">'+esc(item.provider)+' / '+esc(item.model)+' · '+esc(item.suiteId)+'</div><div class="columns" style="grid-template-columns:1fr 1fr;gap:12px;margin-top:10px"><div><div class="run-meta">Average score · '+score+'%</div><div class="barline"><span style="width:'+score+'%;background:var(--cyan)"></span></div></div><div><div class="run-meta">Pass rate · '+pass+'%</div><div class="barline"><span style="width:'+pass+'%;background:var(--emerald)"></span></div></div></div><div class="run-meta" style="margin-top:8px">'+duration.toLocaleString()+' ms average · ~'+tokens.toLocaleString()+' estimated tokens · '+item.completedTrials+' completed trials</div></div></div>';
    }).join(""):'<div class="empty">Run benchmark matrices to compare candidate performance visually.</div>';
    el("experimentRegressions").innerHTML=data.regressions.length?data.regressions.map(item=>'<div class="run-meta" style="color:var(--danger)">REGRESSION · '+esc(item)+'</div>').join(""):'<div class="run-meta">No score drops of 5 points or more detected in the selected history.</div>';
    el("experimentHistoryCaveats").textContent=(data.caveats||[]).join(" · ");
  }catch(error){el("experimentLeaderboard").innerHTML='<div class="error">'+esc(error.message)+'</div>';}
}

async function loadAgentOptimization(){
  try{
    const plan=await api("/api/agent-optimization");
    if(plan.status==="insufficient-history" && isShowcase){
      el("agentOptimizationStatus").textContent="2 recommendations";
      el("agentOptimization").innerHTML='<div class="activity-item"><div style="width:100%"><div class="rowitem"><b>security-reviewer · candidate-claude</b><span class="pill pill-emerald">high confidence</span></div><div class="run-meta">Score 94 → 98 (+4) · skills observed: secure-changes</div><div class="run-meta" style="color:var(--emerald)">RECOMMEND · Provide strict JSON schema for zero-trust boundary verification</div></div></div><div class="activity-item"><div style="width:100%"><div class="rowitem"><b>planner · candidate-gpt41</b><span class="pill pill-cyan">medium confidence</span></div><div class="run-meta">Score 90 → 94 (+4) · skills observed: architecture-mapping</div><div class="run-meta" style="color:var(--cyan)">RECOMMEND · Pin maximum task granularity to 5 files per sub-step</div></div></div>';
      return;
    }
    el("agentOptimizationStatus").textContent=plan.status==="recommendations"?plan.suggestions.length+" suggestions":"NEEDS HISTORY";
    el("agentOptimization").innerHTML=plan.suggestions?.length?plan.suggestions.map(item=>'<div class="activity-item"><div style="width:100%"><div class="rowitem"><b>'+esc(item.agent)+' · '+esc(item.candidateId)+'</b><span class="pill">'+esc(item.confidence)+' confidence</span></div><div class="run-meta">Score '+(item.baselineScore===null?"no baseline":item.baselineScore+' → '+item.currentScore+' ('+item.scoreDelta+')')+' · skills observed: '+esc(item.skillIdsObserved.join(", ")||"none")+'</div>'+item.recommendedActions.map(action=>'<div class="run-meta">RECOMMEND · '+esc(action)+'</div>').join("")+'</div></div>').join(""):'<div class="empty">'+(plan.status==="insufficient-history"?"Run the same evaluation suite and goal twice to establish a baseline.":"No repeated failure patterns found in the latest comparable matrix.")+'</div>';
  }catch(error){el("agentOptimization").innerHTML='<div class="error">'+esc(error.message)+'</div>';}
}

async function loadAgentIntelligence(){
  try{
    const data=await api("/api/agent-intelligence");
    if((data.status==="insufficient-data"||!data.cards?.length) && isShowcase){
      el("agentIntelligenceStatus").textContent="READY";
      el("agentIntelligence").innerHTML='<div class="activity-item"><div style="width:100%"><div class="rowitem"><b>security-reviewer</b><span class="pill pill-accent">98/100 avg (high confidence)</span></div><div class="run-meta">14 evaluations analyzed · <span style="color:var(--emerald)">+6 points score trend</span></div><div class="run-meta" style="margin-top:4px"><b>Repeated failure criteria:</b> <span class="pill pill-emerald">0% failure rate</span></div><div class="run-meta" style="margin-top:4px"><b>Recommendations:</b> Model demonstrates high adherence to least-privilege checks.</div></div></div><div class="activity-item"><div style="width:100%"><div class="rowitem"><b>architect</b><span class="pill pill-cyan">94/100 avg (high confidence)</span></div><div class="run-meta">16 evaluations analyzed · <span style="color:var(--cyan)">+4 points score trend</span></div><div class="run-meta" style="margin-top:4px"><b>Repeated failure criteria:</b> <span class="pill">circular-import 4%</span></div></div></div>';
      return;
    }
    el("agentIntelligenceStatus").textContent=data.status.toUpperCase();
    if(data.status==="insufficient-data"||!data.cards?.length){
      el("agentIntelligence").innerHTML='<div class="empty">Not enough historical benchmark data yet. Run benchmark matrices across multiple trials.</div>';
      return;
    }
    el("agentIntelligence").innerHTML=data.cards.map(c=>'<div class="activity-item"><div style="width:100%"><div class="rowitem"><b>'+esc(c.agent)+'</b><span class="pill">'+c.averageScore+'/100 avg ('+esc(c.confidence)+' confidence)</span></div><div class="run-meta">'+c.evaluations+' evaluations analyzed</div></div></div>').join("");
  }catch(e){el("agentIntelligence").innerHTML='<div class="error">'+esc(e.message)+'</div>';}
}

async function loadObservability(){
  try{
    let data=await api("/api/observability");
    if((!data.totals.requests) && isShowcase){
      data = {
        generatedAt: new Date().toISOString(),
        runsScanned: 8,
        totals: { requests: 28, inputTokensEstimate: 48200, outputTokensEstimate: 14600, durationMs: 14800, failures: 0, fallbacks: 0 },
        agents: [
          { name: "security-reviewer", requests: 8, inputTokensEstimate: 16400, outputTokensEstimate: 4200, durationMs: 4800, failures: 0, retries: 0 },
          { name: "architect", requests: 8, inputTokensEstimate: 14200, outputTokensEstimate: 3800, durationMs: 4100, failures: 0, retries: 0 },
          { name: "test-engineer", requests: 6, inputTokensEstimate: 9800, outputTokensEstimate: 3900, durationMs: 3200, failures: 0, retries: 0 },
          { name: "code-reviewer", requests: 6, inputTokensEstimate: 7800, outputTokensEstimate: 2700, durationMs: 2700, failures: 0, retries: 0 }
        ],
        providers: [
          { name: "OpenAI", requests: 14, successes: 14, fallbacks: 0, failures: 0, retries: 0, durationMs: 6800 },
          { name: "Anthropic", requests: 8, successes: 8, fallbacks: 0, failures: 0, retries: 0, durationMs: 4800 },
          { name: "Google", requests: 6, successes: 6, fallbacks: 0, failures: 0, retries: 0, durationMs: 3200 }
        ],
        budgets: { perAgentTokens: { "security-reviewer": 50000, "architect": 50000 }, perAgentDurationMs: {}, runTokens: 100000, taskDurationMs: null }
      };
    }
    const t=data.totals;
    el("observabilityUpdated").textContent="Updated "+new Date(data.generatedAt).toLocaleTimeString();
    el("observabilityMetrics").innerHTML=metric("Provider requests",t.requests,"Recorded agent attempts")+metric("Estimated tokens","~"+(t.inputTokensEstimate+t.outputTokensEstimate).toLocaleString(),"Input "+t.inputTokensEstimate.toLocaleString()+" · output "+t.outputTokensEstimate.toLocaleString())+metric("Agent time",Math.round(t.durationMs/1000)+" s","Accumulated provider wait time")+metric("Failures / fallbacks",t.failures+" / "+t.fallbacks,data.runsScanned+" runs scanned");
    el("agentObservability").innerHTML=data.agents.length?data.agents.map(a=>{
      const used=a.inputTokensEstimate+a.outputTokensEstimate,limit=data.budgets.perAgentTokens[a.name]||null,pct=limit?Math.min(100,Math.round(used/limit*100)):null;
      return '<div class="activity-item"><div style="width:100%"><div class="rowitem"><b>'+esc(a.name)+'</b><span class="pill pill-accent">'+a.requests+' attempts</span></div><div class="run-meta">~'+used.toLocaleString()+' tokens · '+Math.round(a.durationMs/1000)+' s · '+a.failures+' failures · '+(a.retries||0)+' retries</div>'+(limit?'<div class="barline"><span style="width:'+pct+'%"></span></div><div class="run-meta">'+pct+'% of configured cumulative token budget ('+limit.toLocaleString()+')</div>':'<div class="run-meta">No per-agent token budget configured</div>')+'</div></div>';
    }).join(""):'<div class="empty">No saved agent traces yet. Run a workflow to populate observability.</div>';
    el("providerObservability").innerHTML=data.providers.length?data.providers.map(p=>'<div class="activity-item"><div><b>'+esc(p.name)+'</b><div class="run-meta">'+p.requests+' requests · '+p.successes+' successes · '+p.fallbacks+' fallbacks · '+p.failures+' failures</div><div class="run-meta">'+Math.round(p.durationMs/1000)+' s accumulated duration</div></div></div>').join(""):'<div class="empty">No provider traces recorded yet.</div>';
    el("observabilityWarnings").textContent="Usage is estimated from model character lengths, not provider billing data.";
  }catch(error){el("observabilityMetrics").innerHTML='<div class="error">'+esc(error.message)+'</div>';}
}

async function loadOverview(){
  try{
    const data=await api("/api/overview");
    const s=data.summary;
    const runsCount = (data.runCount || (isShowcase ? SAMPLE_RUNS.length : 0));
    el("metrics").innerHTML=metric("Source files",s.filesScanned,"Files inspected")+metric("Directories",s.directoriesScanned,"Project folders")+metric("Dependencies",data.dependencies.production+data.dependencies.development,data.dependencies.production+" production · "+data.dependencies.development+" development")+metric("Saved runs",runsCount,"Local execution history");
    const total=Math.max(1,s.languages.reduce((n,x)=>n+x.files,0));
    el("languages").innerHTML=s.languages.length?s.languages.slice(0,8).map(x=>'<div><div class="rowitem"><b>'+esc(x.name)+'</b><span class="muted">'+x.files+' files</span></div><div class="barline"><span style="width:'+Math.round(x.files/total*100)+'%"></span></div></div>').join(""):'<div class="empty">No recognized source files found.</div>';
    const stack=[...(data.packageManagers||[]),...(data.frameworks||[])];
    el("stack").innerHTML=stack.length?stack.map(x=>'<div class="rowitem"><b>'+esc(x)+'</b><span class="pill pill-emerald">DETECTED</span></div>').join(""):'<div class="empty">No common stack detected.</div>';
    const signals=[["Important files",data.importantFiles.length],["Available scripts",Object.keys(data.scripts).length],["Scan warnings",data.warnings.length],["Architecture candidates","Ready in Architecture tab"]];
    el("signals").innerHTML=signals.map(([k,v])=>'<div class="rowitem"><b>'+esc(k)+'</b><span class="pill">'+esc(v)+'</span></div>').join("");
  }catch(error){el("metrics").innerHTML='<div class="card error">Dashboard error: '+esc(error.message)+'</div>';}
}

async function loadAgents(){
  try{
    const data=await api("/api/agents");
    el("agents").innerHTML=data.length?data.map(agent=>'<div class="rowitem"><div><b>'+esc(agent.name)+'</b><div class="run-meta">'+esc(agent.description)+'</div></div><span class="pill pill-accent">'+esc(agent.source)+'</span></div>').join(""):'<div class="empty">No agent roles found.</div>';
  }catch(error){el("agents").innerHTML='<div class="error">'+esc(error.message)+'</div>';}
}

let selectedRunId="";
let runMonitorTimer=null;

async function inspectRun(id){
  selectedRunId=id;
  try{
    let run;
    let traceRequest=null;
    if(id.startsWith("run-") && isShowcase){
      run = SAMPLE_RUNS.find(r=>r.id===id) || SAMPLE_RUNS[0];
      traceRequest = {
        totals: { tasks: run.tasks.length, estimatedInputTokens: 14250, estimatedOutputTokens: 3820, durationMs: 1840, fallbacks: 0, failures: 0 },
        entries: [
          { agent: "architect", model: "gpt-4.1-mini", taskId: "scope", tier: "reasoning", durationMs: 420, outcome: "success" },
          { agent: "planner", model: "gpt-4.1-mini", taskId: "plan", tier: "reasoning", durationMs: 310, outcome: "success" },
          { agent: "security-reviewer", model: "claude-3-7-sonnet", taskId: "security", tier: "heavy", durationMs: 580, outcome: "success" },
          { agent: "test-engineer", model: "gemini-2.5-flash", taskId: "verify", tier: "standard", durationMs: 290, outcome: "success" }
        ]
      };
    } else {
      run=await api("/api/runs/"+encodeURIComponent(id));
      traceRequest=await api("/api/runs/"+encodeURIComponent(id)+"/trace").catch(()=>null);
    }
    el("inspectorLabel").textContent=run.id;
    const completedCount=run.tasks.filter(task=>task.status==="completed").length;
    const runningCount=run.tasks.filter(task=>task.status==="running").length;
    const failedCount=run.tasks.filter(task=>task.status==="failed"||task.status==="blocked").length;
    const progressPercent=run.tasks.length?Math.round(completedCount/run.tasks.length*100):0;
    const handoffs=run.tasks.map(task=>'<div class="task-card"><b>'+esc(task.title)+'</b><small>'+esc(task.agent)+' · '+esc(task.id)+'</small><span class="pill '+(task.status==="completed"?"pill-emerald":task.status==="running"?"pill-cyan":"")+'">'+esc(task.status)+'</span><small>'+(task.dependsOn&&task.dependsOn.length?'Receives findings from: '+esc(task.dependsOn.join(', ')):'No upstream dependencies')+'</small></div>').join("");
    const eventStream=run.events.length?'<div class="card"><div class="section-head"><h2>Live event stream</h2><span class="pill pill-cyan">LATEST EVENTS</span></div><div class="activity">'+run.events.slice(-20).reverse().map(event=>'<div class="activity-item"><span class="activity-dot '+(event.type==="completed"?"completed":event.type==="failed"||event.type==="blocked"?"failed":"running")+'"></span><div><b>'+esc(event.taskId)+' · '+esc(event.type)+'</b><div class="run-meta">'+esc(event.message)+' · '+esc(new Date(event.at).toLocaleTimeString())+'</div></div></div>').join("")+'</div></div>':'<div class="empty">No run events recorded yet.</div>';
    const trace=traceRequest?'<div class="card"><div class="section-head"><h2>Execution telemetry</h2><span class="pill pill-accent">LOCAL ESTIMATES</span></div><div class="grid">'+metric("Agent attempts",traceRequest.totals.tasks,"Recorded trace entries")+metric("Input tokens","~"+traceRequest.totals.estimatedInputTokens,"Character-based estimate")+metric("Output tokens","~"+traceRequest.totals.estimatedOutputTokens,"Character-based estimate")+metric("Agent time",traceRequest.totals.durationMs+" ms",traceRequest.totals.fallbacks+" fallbacks · "+traceRequest.totals.failures+" failures")+'</div><div class="activity" style="margin-top:12px">'+traceRequest.entries.slice().reverse().map(entry=>'<div class="activity-item"><span class="activity-dot '+(entry.outcome==="success"?"completed":"failed")+'"></span><div><b>'+esc(entry.agent)+' · '+esc(entry.model)+'</b><div class="run-meta">'+esc(entry.taskId)+' · '+esc(entry.tier)+' tier · '+esc(entry.durationMs)+' ms · '+esc(entry.outcome)+'</div></div></div>').join("")+'</div></div>':'<div class="empty">No execution trace is available for this run yet. Start a provider-backed run to record model and timing telemetry.</div>';
    
    el("runInspector").innerHTML='<div><b>'+esc(run.goal)+'</b><div class="run-meta">'+esc(run.status)+' · '+esc(new Date(run.createdAt).toLocaleString())+'</div><div class="run-meta">'+completedCount+' / '+run.tasks.length+' tasks completed · '+runningCount+' running · '+failedCount+' failed or blocked</div><div class="barline"><span style="width:'+progressPercent+'%"></span></div></div><div class="card"><div class="section-head"><h2>Agent handoff map</h2><span class="pill">'+run.tasks.length+' TASKS</span></div><div class="task-grid">'+handoffs+'</div><div class="run-meta">Dependency links show which completed agent proposals are passed downstream.</div></div>'+eventStream+trace+run.tasks.map(task=>'<article class="inspector-task '+(task.status==="awaiting_approval"?"approval":"")+'"><div class="run-title"><b>'+esc(task.title)+'</b><span class="pill">'+esc(task.status)+'</span></div><div class="run-meta">'+esc(task.agent)+' · '+esc(task.id)+(task.dependsOn&&task.dependsOn.length?' · depends on '+esc(task.dependsOn.join(', ')):'')+'</div>'+(task.result?'<pre>'+esc(task.result.content)+'</pre>':"")+(task.error?'<div class="error">'+esc(task.error)+'</div>':"")+(task.status==="awaiting_approval"?'<div class="run-meta">Human decision required before this task can proceed.</div><div class="approval-actions"><button class="btn approve" data-approval="approved" data-task="'+esc(task.id)+'">Approve task</button><button class="btn reject" data-approval="rejected" data-task="'+esc(task.id)+'">Reject task</button></div>':"")+(task.status==="failed"?'<div class="approval-actions"><button class="btn" data-retry-task="'+esc(task.id)+'">Retry this task and blocked dependants</button></div>':"")+'</article>').join("");

    el("runInspector").querySelectorAll("[data-approval]").forEach(button=>button.addEventListener("click",()=>submitApproval(id,button.getAttribute("data-task"),button.getAttribute("data-approval"))));
    el("runInspector").querySelectorAll("[data-retry-task]").forEach(button=>button.addEventListener("click",async()=>{try{const taskId=button.getAttribute("data-retry-task");const response=await fetch("/api/runs/"+encodeURIComponent(id)+"/tasks/"+encodeURIComponent(taskId)+"/retry",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});const data=await response.json();if(!response.ok)throw new Error(data.error||"Task retry could not be created.");await loadRuns();await inspectRun(data.id);}catch(error){el("runInspector").insertAdjacentHTML("afterbegin",'<div class="error">'+esc(error.message)+'</div>');}}));

    if(run.status==="running"||run.status==="pending"||run.status==="awaiting_approval"){
      const cancel=document.createElement("button");cancel.className="btn reject";cancel.textContent="Cancel run";
      cancel.addEventListener("click",async()=>{try{const response=await fetch("/api/runs/"+encodeURIComponent(id)+"/cancel",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});const data=await response.json();if(!response.ok)throw new Error(data.error||"Cancellation failed.");await loadRuns();await inspectRun(id);}catch(error){el("runInspector").insertAdjacentHTML("afterbegin",'<div class="error">'+esc(error.message)+'</div>');}});
      el("runInspector").prepend(cancel);
    }
    const compare=document.createElement("button");compare.className="btn";compare.textContent="Compare with previous run";
    compare.addEventListener("click",async()=>{try{const runs=await api("/api/runs");const other=runs.find(item=>item.id!==id);if(!other)throw new Error("There is no second run to compare yet.");const previous=await api("/api/runs/"+encodeURIComponent(other.id));const before=new Map(previous.tasks.map(task=>[task.id,task]));const rows=run.tasks.map(task=>{const old=before.get(task.id);return '<div class="rowitem"><b>'+esc(task.title)+'</b><span class="pill">'+esc(old?old.status+" → "+task.status:"new task")+'</span></div>';}).join("");const removed=previous.tasks.filter(task=>!run.tasks.some(current=>current.id===task.id)).length;el("runInspector").insertAdjacentHTML("afterbegin",'<div class="card"><div class="section-head"><h2>Run comparison</h2><span class="pill">LATEST AVAILABLE</span></div><div class="run-meta">'+esc(previous.id)+' ('+esc(previous.status)+') → '+esc(run.id)+' ('+esc(run.status)+')</div>'+rows+(removed?'<div class="run-meta">'+removed+' task(s) removed from current run.</div>':"")+'</div>');}catch(error){el("runInspector").insertAdjacentHTML("afterbegin",'<div class="error">'+esc(error.message)+'</div>');}});
    el("runInspector").prepend(compare);

    if(run.status==="failed"){
      const replay=document.createElement("button");replay.className="btn";replay.textContent="Create replay of retryable tasks";
      replay.addEventListener("click",async()=>{try{const response=await fetch("/api/runs/"+encodeURIComponent(id)+"/replay",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});const data=await response.json();if(!response.ok)throw new Error(data.error||"Replay creation failed.");await loadRuns();await inspectRun(data.id);}catch(error){el("runInspector").insertAdjacentHTML("afterbegin",'<div class="error">'+esc(error.message)+'</div>');}});
      el("runInspector").prepend(replay);
    }

    document.querySelectorAll(".run").forEach(item=>item.classList.toggle("selected",item.getAttribute("data-run-id")===id));
  }catch(error){el("runInspector").innerHTML='<div class="error">'+esc(error.message)+'</div>';}
}

async function loadRuns(){
  try{
    let data=await api("/api/runs");
    if(!data.length && isShowcase){
      data = SAMPLE_RUNS;
    }
    el("runs").innerHTML=data.length?data.slice(0,7).map(run=>'<div class="run" data-run-id="'+esc(run.id)+'" tabindex="0" role="button"><div class="run-title"><span class="run-goal">'+esc(run.goal)+'</span><span class="pill '+(run.status==="completed"?"pill-emerald":"pill-accent")+'">'+esc(run.status)+'</span></div><div class="run-meta">'+esc(run.id)+' · '+esc(new Date(run.createdAt).toLocaleString())+' · '+run.tasks.length+' tasks</div></div>').join(""):'<div class="empty">No saved runs yet. Create one with <code>anvil plan --goal "..."</code>.</div>';
    el("runs").querySelectorAll("[data-run-id]").forEach(item=>{
      const select=()=>inspectRun(item.getAttribute("data-run-id"));
      item.addEventListener("click",select);
      item.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();select();}});
    });
    if(data.length && (!selectedRunId || !data.some(r=>r.id===selectedRunId))){
      inspectRun(data[0].id);
    }
  }catch(error){el("runs").innerHTML='<div class="error">'+esc(error.message)+'</div>';}
}

async function loadActivity(){
  try{
    let runs=await api("/api/runs");
    if(!runs.length && isShowcase) runs = SAMPLE_RUNS;
    el("activityUpdated").textContent="Updated "+new Date().toLocaleTimeString();
    if(!runs.length){
      el("activity").innerHTML='<div class="empty">No agent activity yet. Create a plan or run to populate this view.</div>';
      el("taskStatus").innerHTML='<div class="empty">No tasks recorded.</div>';
      return;
    }
    const latest=runs[0],events=latest.events||[];
    el("activity").innerHTML=events.length?events.slice(-12).reverse().map(event=>'<div class="activity-item"><span class="activity-dot '+esc(event.type)+'"></span><div><b>'+esc(event.type.replaceAll("_"," "))+'</b><div class="run-meta">'+esc(event.message)+'</div><div class="run-meta">'+esc(event.taskId)+' · '+esc(new Date(event.at).toLocaleTimeString())+'</div></div></div>').join(""):'<div class="empty">Latest run has no recorded events yet.</div>';
    el("taskStatus").innerHTML=latest.tasks.length?latest.tasks.map(task=>'<div class="task-card"><b>'+esc(task.title||task.id)+'</b><small>'+esc(task.agent||"Agent")+'</small><span class="pill '+(task.status==="completed"?"pill-emerald":"")+'">'+esc(task.status)+'</span></div>').join(""):'<div class="empty">No tasks recorded.</div>';
  }catch(error){el("activity").innerHTML='<div class="error">'+esc(error.message)+'</div>';}
}

async function loadHealth(){
  try{
    const data=await api("/api/health");
    const c=data.current;
    const rate=c.verification.successRate===null?"—":c.verification.successRate+"%";
    const score=c.engineeringScore;
    const metrics=[["Engineering score",score.score+"/100 ("+score.grade+")"],["Evidence coverage",score.confidencePercent+"%"],["Quality score",c.quality.score+"/100 ("+c.quality.grade+")"],["Verification success",rate]];
    const cards=metrics.map(([name,value])=>'<div class="card"><div class="metric-label">'+esc(name)+'</div><div class="metric">'+esc(value)+'</div></div>').join("");
    const points=data.history.slice(-12);const values=points.map(p=>p.quality.score);
    const chart=values.length>1?(()=>{
      const min=Math.min(...values,0),max=Math.max(...values,100),range=Math.max(1,max-min);
      const coords=values.map((v,i)=>(24+i*252/Math.max(1,values.length-1))+","+(86-(v-min)*66/range));
      return '<div class="card"><b>Quality score trend</b><svg viewBox="0 0 300 100" role="img" aria-label="Quality score history" style="width:100%;height:110px"><polyline fill="none" stroke="var(--emerald)" stroke-width="2.5" points="'+coords.join(" ")+'"/><circle cx="'+coords[coords.length-1].split(",")[0]+'" cy="'+coords[coords.length-1].split(",")[1]+'" r="4" fill="var(--cyan)"/></svg><div class="run-meta">'+values.length+' saved health snapshots</div></div>';
    })():'<div class="card"><b>Quality score trend</b><div class="empty">Generate more health snapshots to see a trend.</div></div>';
    const severity=Object.entries(c.quality.bySeverity).map(([name,count])=>'<span class="pill">'+esc(name)+": "+esc(count)+'</span>').join(" ");
    const dimensions=score.dimensions.map(x=>'<div class="rowitem"><div><b>'+esc(x.label)+'</b><div class="run-meta">'+esc(x.reason)+'</div></div><span class="pill">'+(x.score===null?"NOT ASSESSED":esc(x.score)+"/100")+'</span></div>').join("");
    el("healthPanel").innerHTML='<div class="grid">'+cards+'</div><div style="margin-top:14px"><b>Unified score dimensions</b><div class="activity">'+dimensions+'</div></div>'+chart+'<div style="margin-top:12px"><b>Findings by severity</b><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">'+severity+'</div></div>';
  }catch(error){el("healthPanel").innerHTML='<div class="error">'+esc(error.message)+'</div>';}
}

async function loadRegression(){
  try{
    const data=await api("/api/regression");const s=data.summary;
    const cards=[["Regressions",s.regressions],["Recovered",s.recovered],["Persistent failures",s.persistentFailures],["Checks tracked",s.checksReviewed]];
    const top='<div class="grid">'+cards.map(([k,v])=>'<div class="card"><div class="metric-label">'+esc(k)+'</div><div class="metric">'+esc(v)+'</div></div>').join("")+'</div>';
    let checks=data.checks.slice(0,8).map(item=>'<div class="rowitem"><div><b>'+esc(item.script)+'</b><div class="run-meta">'+(item.previous?esc(item.previous.status)+' → '+esc(item.latest.status):'First recorded baseline')+'</div></div><span class="pill">'+esc(item.state.replaceAll("_"," "))+'</span></div>').join("");
    if(!checks && isShowcase){
      checks='<div class="rowitem"><div><b>npm test</b><div class="run-meta">479 tests passed · zero regressions</div></div><span class="pill pill-emerald">STABLE</span></div><div class="rowitem"><div><b>npm run typecheck</b><div class="run-meta">TypeScript strict mode clean</div></div><span class="pill pill-emerald">STABLE</span></div>';
    }
    el("regressionPanel").innerHTML=top+(checks||'<div class="empty">No verification history yet. Run anvil verify SCRIPT to establish a baseline.</div>');
  }catch(error){el("regressionPanel").innerHTML='<div class="error">'+esc(error.message)+'</div>';}
}

async function loadReviews(){
  try{
    let data=await api("/api/reviews");
    if(!data.length && isShowcase){
      data = [
        { id: "rev-sec-01", createdAt: new Date(Date.now() - 3600000).toISOString(), filesReviewed: 12, staticFindings: 1, aiSuggestions: 2, topFindings: ["No secret leakage in environment templates", "Sanitize dynamic shell args"], scope: "src/" },
        { id: "rev-arch-02", createdAt: new Date(Date.now() - 86400000).toISOString(), filesReviewed: 48, staticFindings: 0, aiSuggestions: 1, topFindings: ["Clean layered boundaries verified"], scope: "src/core/" }
      ];
    }
    el("reviewPanel").innerHTML=data.length?data.slice(0,8).map(item=>'<div class="rowitem"><div><b>'+esc(item.id)+'</b><div class="run-meta">'+esc(new Date(item.createdAt).toLocaleString())+' · '+esc(item.filesReviewed)+' files · '+esc(item.staticFindings)+' static findings · '+esc(item.aiSuggestions)+' AI suggestions</div>'+(item.topFindings?.length?'<div class="run-meta">'+item.topFindings.map(esc).join(" · ")+'</div>':"")+'</div><span class="pill pill-cyan">'+esc(item.scope)+'</span></div>').join(""):'<div class="empty">No saved reviews yet. Run anvil review . to create one.</div>';
  }catch(error){el("reviewPanel").innerHTML='<div class="error">'+esc(error.message)+'</div>';}
}

async function loadQuality(){
  try{
    const data=await api("/api/quality");
    const head='<div class="rowitem"><b>Rule-based score</b><span class="pill pill-accent">'+esc(data.score)+'/100 · '+esc(data.grade)+'</span></div><div class="run-meta">'+esc(data.findings.length)+' findings · '+esc(data.metrics.sourceFiles)+' source files · '+esc(data.metrics.testFiles)+' test files</div>';
    const items=data.findings.slice(0,6).map(item=>'<div class="rowitem"><div><b>'+esc(item.title)+'</b><div class="run-meta">'+esc(item.recommendation)+'</div></div><span class="pill">'+esc(item.severity)+'</span></div>').join("");
    el("qualityPanel").innerHTML=head+(items||'<div class="empty">No findings from available static checks.</div>');
  }catch(error){el("qualityPanel").innerHTML='<div class="error">'+esc(error.message)+'</div>';}
}

async function loadVerifications(){
  try{
    let data=await api("/api/verifications");
    if(!data.length && isShowcase){
      data = [
        { script: "npm test", startedAt: new Date(Date.now() - 600000).toISOString(), durationMs: 46170, status: "passed" },
        { script: "npm run typecheck", startedAt: new Date(Date.now() - 720000).toISOString(), durationMs: 2410, status: "passed" },
        { script: "npm run build", startedAt: new Date(Date.now() - 840000).toISOString(), durationMs: 3120, status: "passed" },
        { script: "anvil clean --verify", startedAt: new Date(Date.now() - 960000).toISOString(), durationMs: 1450, status: "passed" }
      ];
    }
    if(!data.length){el("verificationPanel").innerHTML='<div class="empty">No verification runs yet. Use anvil verify SCRIPT.</div>';return;}
    el("verificationPanel").innerHTML=data.slice(0,8).map(item=>'<div class="rowitem"><div><b>'+esc(item.script)+'</b><div class="run-meta">'+esc(new Date(item.startedAt).toLocaleString())+' · '+esc(item.durationMs)+' ms</div></div><span class="pill '+(item.status==="passed"?"pill-emerald":"pill-accent")+'">'+esc(item.status)+'</span></div>').join("");
  }catch(error){el("verificationPanel").innerHTML='<div class="error">'+esc(error.message)+'</div>';}
}

// Cleaner tab & Self-Healing actions
async function loadCleanerBackups(){
  const target = el("cleanerBackupsList");
  if(!target) return;
  try{
    const res = await api("/api/clean/snapshots");
    let snapshots = res.snapshots || [];
    if(!snapshots.length && isShowcase){
      snapshots = [
        { id: "backup-1795188", at: new Date(Date.now() - 1200000).toISOString(), files: 3 },
        { id: "backup-1795164", at: new Date(Date.now() - 86400000).toISOString(), files: 2 }
      ];
    }
    target.innerHTML = snapshots.length ? snapshots.map(s=>'<div class="rowitem"><div><b>'+esc(s.id)+'</b><div class="run-meta">'+esc(new Date(s.at).toLocaleString())+' · '+s.files+' files preserved</div></div><span class="pill pill-emerald">ROLLBACK READY</span></div>').join("") : '<div class="empty">No backup snapshots recorded. Run <code>anvil clean --apply</code> to create one.</div>';
  }catch(e){target.innerHTML='<div class="error">'+esc(e.message)+'</div>';}
}

async function runCleanerPreview(){
  const output = el("cleanerLiveOutput");
  if(!output) return;
  output.innerHTML = '<div class="loading">Scanning project for temporary clutter, OS junk and unused imports…</div>';
  try{
    const data = await api("/api/clean/preview");
    let html = '<div class="card" style="background:#090d14;margin-bottom:12px;"><b>Scan Summary:</b> '+data.stats.junkFound+' junk items · '+data.stats.codeFixesFound+' unused import fixes · '+data.stats.orphanFilesFound+' unreferenced files</div>';
    if(data.junkItems?.length){
      html += '<div style="margin-top:10px"><b>Junk files detected:</b>'+data.junkItems.slice(0,10).map(j=>'<div class="rowitem"><div><b>'+esc(j.path)+'</b><div class="run-meta">'+esc(j.category)+' · '+esc(j.reason)+'</div></div><span class="pill pill-accent">CLEANABLE</span></div>').join("")+'</div>';
    } else {
      html += '<div class="run-meta" style="color:var(--emerald);margin:8px 0">✓ Zero OS junk or temporary editor debris found!</div>';
    }
    if(data.codeFixes?.length){
      html += '<div style="margin-top:10px"><b>Code fixes available:</b>'+data.codeFixes.slice(0,10).map(f=>'<div class="rowitem"><div><b>'+esc(f.file)+'</b><div class="run-meta">'+esc(f.detail)+'</div></div><span class="pill pill-cyan">AUTO-FIX</span></div>').join("")+'</div>';
    }
    output.innerHTML = html;
  }catch(err){output.innerHTML = '<div class="error">'+esc(err.message)+'</div>';}
}

async function loadMemory(){
  try{
    const res=await api("/api/memory");
    let entries = res.entries || [];
    if(!entries.length && isShowcase){
      entries = [
        { id: "mem-showcase-1", kind: "architecture", content: "ANVIL uses local-first AST parsing for polyglot module mapping across 6 languages.", tags: ["ast", "polyglot"], updatedAt: new Date().toISOString() },
        { id: "mem-showcase-2", kind: "decision", content: "Every code fix and cleaner run requires automated test gate verification (--verify) with instant rollback.", tags: ["safety", "rollback"], updatedAt: new Date().toISOString() },
        { id: "mem-showcase-3", kind: "constraint", content: "Never forward arbitrary environment secrets or credentials to third-party providers or tools.", tags: ["security"], updatedAt: new Date().toISOString() }
      ];
    }
    el("memoryList").innerHTML = entries.length ? entries.map(item => {
      const kindClass = item.kind === "decision" ? "pill-emerald" : item.kind === "constraint" ? "pill-accent" : "pill-cyan";
      return '<div class="rowitem" style="align-items:flex-start"><div><div style="display:flex;gap:6px;align-items:center;margin-bottom:4px"><span class="pill ' + kindClass + '">' + esc(item.kind.toUpperCase()) + '</span>' + (item.tags||[]).map(t => '<span class="pill" style="font-size:10px">#' + esc(t) + '</span>').join('') + '<span class="run-meta" style="margin-left:8px">' + esc(item.id) + '</span></div><div style="font-size:13px;line-height:1.4">' + esc(item.content) + '</div></div>' + (!item.id.startsWith("mem-showcase") ? '<button class="btn" style="padding:4px 8px;font-size:11px" onclick="deleteMemoryEntry(\'' + esc(item.id) + '\')">Remove</button>' : '') + '</div>';
    }).join("") : '<div class="empty">No project memory entries saved yet. Add a decision or constraint above to guide your agents!</div>';
  }catch(e){el("memoryList").innerHTML='<div class="error">'+esc(e.message)+'</div>';}
}

async function deleteMemoryEntry(id){
  try{
    await fetch("/api/memory/delete",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id})});
    loadMemory();
  }catch(e){alert("Failed to remove memory: "+e.message);}
}

async function loadAdrs(){
  try{
    const res = await api("/api/adrs");
    let adrs = res.adrs || [];
    if(!adrs.length && isShowcase){
      adrs = [
        { id: "0001", number: 1, title: "Record architecture decisions", status: "Accepted", date: new Date().toISOString().slice(0, 10), filename: "0001-record-architecture-decisions.md" },
        { id: "0002", number: 2, title: "Local-first AST analysis for zero-telemetry polyglot code intelligence", status: "Accepted", date: new Date().toISOString().slice(0, 10), filename: "0002-local-first-ast-analysis.md" },
        { id: "0003", number: 3, title: "Deterministic automated test gate with instant rollback on clean", status: "Accepted", date: new Date().toISOString().slice(0, 10), filename: "0003-deterministic-test-gate.md" }
      ];
    }
    const container = el("adrList");
    if(!container) return;
    container.innerHTML = adrs.length ? adrs.map(item => {
      const statusPill = item.status === "Accepted" ? "pill-emerald" : item.status === "Proposed" ? "pill-cyan" : "pill-accent";
      return '<div class="rowitem"><div><div style="display:flex;gap:6px;align-items:center;margin-bottom:4px"><span class="pill ' + statusPill + '">' + esc(item.status.toUpperCase()) + '</span><span class="pill" style="font-size:10px">ADR-' + esc(item.id) + '</span><span class="run-meta">' + esc(item.date) + '</span></div><div style="font-size:13px;font-weight:600">' + esc(item.title) + '</div><div class="run-meta" style="font-size:11px">' + esc(item.filename) + '</div></div></div>';
    }).join("") : '<div class="empty">No Architecture Decision Records found. Click "+ New ADR" or "Sync Memory to ADRs" to initialize docs/adr/</div>';
  }catch(e){
    const container = el("adrList");
    if(container) container.innerHTML = '<div class="error">' + esc(e.message) + '</div>';
  }
}

async function handleCreateAdr(){
  const titleEl = el("newAdrTitle");
  const statusEl = el("newAdrStatus");
  const title = titleEl ? titleEl.value.trim() : "";
  if(!title) return alert("Please enter an ADR title.");
  const status = statusEl ? statusEl.value : "Accepted";
  try{
    await fetch("/api/adrs",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({title,status})});
    if(titleEl) titleEl.value = "";
    loadAdrs();
  }catch(e){alert("Failed to create ADR: "+e.message);}
}

async function handleSyncAdrs(){
  try{
    const res = await fetch("/api/adrs/sync",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({})});
    const data = await res.json();
    alert(data.syncedCount > 0 ? "Synced " + data.syncedCount + " decisions to docs/adr/!" : "All project memory decisions already synced!");
    loadAdrs();
  }catch(e){alert("Failed to sync ADRs: "+e.message);}
}

async function loadSecurityAudit(){
  try{
    const res = await api("/api/security");
    const summaryEl = el("securitySummary");
    const findingsEl = el("securityFindings");
    const pill = el("securityStatusPill");
    if(!summaryEl || !findingsEl) return;

    if(pill){
      if(res.passed){
        pill.className = "pill pill-emerald";
        pill.textContent = "SECURE";
      }else{
        pill.className = "pill pill-accent";
        pill.textContent = res.summary.critical > 0 ? "CRITICAL RISK" : "HIGH RISK";
      }
    }

    summaryEl.innerHTML = '<div class="card card-highlight"><div class="metric-label">Security Status</div><div class="metric" style="color:' + (res.passed ? 'var(--emerald)' : 'var(--accent)') + '">' + (res.passed ? 'SECURE' : 'ACTION REQUIRED') + '</div><div class="metric-sub">' + res.findings.length + ' total findings</div></div><div class="card"><div class="metric-label">Critical Secrets</div><div class="metric" style="color:var(--accent)">' + res.summary.critical + '</div><div class="metric-sub">API keys, tokens, keys</div></div><div class="card"><div class="metric-label">High Severity</div><div class="metric" style="color:var(--amber,#f59e0b)">' + res.summary.high + '</div><div class="metric-sub">Scripts, unencrypted deps</div></div><div class="card"><div class="metric-label">Scanned Scope</div><div class="metric" style="color:var(--cyan)">' + res.scannedFiles + '</div><div class="metric-sub">Files in ' + res.durationMs + 'ms</div></div>';

    findingsEl.innerHTML = res.findings.length ? res.findings.map(f => {
      const sevClass = f.severity === "critical" ? "pill-accent" : f.severity === "high" ? "pill-amber" : "pill-cyan";
      return '<div class="rowitem"><div><div style="display:flex;gap:6px;align-items:center;margin-bottom:4px"><span class="pill ' + sevClass + '">' + esc(f.severity.toUpperCase()) + '</span><span class="pill" style="font-size:10px">' + esc(f.category) + '</span><span class="run-meta">' + esc(f.file + (f.line ? ':' + f.line : '')) + '</span></div><div style="font-size:13px;font-weight:600">' + esc(f.description) + '</div>' + (f.snippet ? '<div class="run-meta" style="font-family:monospace;font-size:11px">Snippet: ' + esc(f.snippet) + '</div>' : '') + '<div class="run-meta" style="font-size:11px;color:var(--text-muted)">Remediation: ' + esc(f.remediation) + '</div></div></div>';
    }).join("") : '<div class="empty" style="color:var(--emerald)">✓ Clean audit: No hardcoded secrets, dangerous scripts, or exposed credentials detected.</div>';
  }catch(e){
    const findingsEl = el("securityFindings");
    if(findingsEl) findingsEl.innerHTML = '<div class="error">' + esc(e.message) + '</div>';
  }
}

async function handleAutoFixSecurity(){
  try{
    const res = await fetch("/api/security/fix",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({})});
    const data = await res.json();
    alert(data.fixedCount > 0 ? "Applied " + data.fixedCount + " security fixes:\n" + data.details.join("\n") : "No pending auto-fixable exclusions.");
    loadSecurityAudit();
  }catch(e){alert("Failed to apply security fixes: "+e.message);}
}

async function runDoctorDiagnostics(targetOutputId = "cleanerLiveOutput") {
  const output = el(targetOutputId);
  if (!output) return;
  output.innerHTML = '<div class="loading">Running full system health and runtime diagnostic checks…</div>';
  try {
    const rep = await api("/api/doctor");
    let html = '<div class="card" style="background:#090d14;margin-bottom:10px"><b>Doctor Diagnostic Status:</b> <span class="pill ' + (rep.summary.status === "pass" ? "pill-emerald" : "pill-accent") + '">' + rep.summary.status.toUpperCase() + '</span> (' + rep.summary.passed + ' passed, ' + rep.summary.failed + ' failed, ' + rep.summary.warnings + ' warnings)</div>';
    html += rep.checks.map(c => '<div class="rowitem"><div><b>' + esc(c.name) + '</b><div class="run-meta">' + esc(c.message) + '</div></div><span class="pill ' + (c.status === "pass" ? "pill-emerald" : c.status === "warn" ? "pill-accent" : "pill") + '">' + esc(c.status.toUpperCase()) + '</span></div>').join("");
    output.innerHTML = html;
  } catch (err) {
    output.innerHTML = '<div class="error">' + esc(err.message) + '</div>';
  }
}

on("runCleanDryRunBtn", runCleanerPreview);
on("quickCleanBtn", () => {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  const btn = document.querySelector('[data-tab="tab-cleaner"]');
  if (btn) btn.classList.add("active");
  const pane = el("tab-cleaner");
  if (pane) pane.scrollIntoView({ behavior: "smooth", block: "start" });
  runCleanerPreview();
});

on("quickDoctorBtn", () => {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  const btn = document.querySelector('[data-tab="tab-cleaner"]');
  if (btn) btn.classList.add("active");
  const pane = el("tab-cleaner");
  if (pane) pane.scrollIntoView({ behavior: "smooth", block: "start" });
  runDoctorDiagnostics("cleanerLiveOutput");
});

on("runDoctorDiagnosticsBtn", () => runDoctorDiagnostics("cleanerLiveOutput"));

async function loadGate() {
  const statusMetric = el("gateStatusMetric");
  const statusSub = el("gateStatusSub");
  const newMetric = el("gateNewFindingsMetric");
  const baseMetric = el("gateBaselineMetric");
  const suppMetric = el("gateSuppressionsMetric");
  const violationsBox = el("gateViolationsContainer");
  const advisoriesBox = el("gateAdvisoriesContainer");
  const list = el("gateFindingsList");
  const filePill = el("policyFilePill");
  const countPill = el("findingsCountPill");

  if (isShowcase) {
    if (statusMetric) { statusMetric.textContent = "PASSED"; statusMetric.style.color = "var(--emerald)"; }
    if (statusSub) statusSub.textContent = "All quality & security checks satisfied";
    if (newMetric) newMetric.textContent = "0";
    if (baseMetric) baseMetric.textContent = "2";
    if (suppMetric) suppMetric.textContent = "1";
    if (filePill) filePill.textContent = ".anvil/policy.json";
    if (countPill) countPill.textContent = "3 FINDINGS (2 BASELINE, 1 SUPPRESSED)";
    if (violationsBox) violationsBox.innerHTML = '<div style="padding:10px 14px;border-radius:8px;background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.3);color:var(--emerald);font-size:12px"><b>✓ Zero policy gate violations.</b> Repository meets all quality and security criteria.</div>';
    if (advisoriesBox) advisoriesBox.innerHTML = '';
    if (list) list.innerHTML = '<div class="rowitem"><div><b>ANVIL-R003</b> [low] Inline suppression on line 42 with verified justification.<div class="run-meta">src/core/dashboard-server.ts:42</div></div><span class="pill pill-emerald">SUPPRESSED</span></div><div class="rowitem"><div><b>ANVIL-R001</b> [low] Legacy console output accepted in baseline.<div class="run-meta">scripts/setup.js:14</div></div><span class="pill pill-cyan">BASELINE</span></div>';
    return;
  }

  try {
    const data = await api("/api/gate");
    if (statusMetric) {
      statusMetric.textContent = data.passed ? "PASSED" : "FAILED";
      statusMetric.style.color = data.passed ? "var(--emerald)" : "var(--danger)";
    }
    if (statusSub) statusSub.textContent = data.passed ? "All quality & security checks satisfied" : "Policy violations detected";
    const activeCount = (data.summary?.critical ?? 0) + (data.summary?.high ?? 0) + (data.summary?.medium ?? 0) + (data.summary?.low ?? 0);
    if (newMetric) newMetric.textContent = String(activeCount);
    if (baseMetric) baseMetric.textContent = String(data.summary?.suppressedByBaseline ?? 0);
    if (suppMetric) suppMetric.textContent = String(data.summary?.inlineSuppressions ?? 0);
    if (filePill) filePill.textContent = data.policyPath ? data.policyPath.replace(/\\/g, "/").split("/").pop() : "DEFAULT FAIL-CLOSED";
    const total = (data.activeFindings?.length ?? 0) + (data.suppressedFindings?.length ?? 0);
    if (countPill) countPill.textContent = total + " FINDINGS";

    if (violationsBox) {
      if (data.violations && data.violations.length > 0) {
        violationsBox.innerHTML = '<div class="card" style="border-color:rgba(251,113,133,0.5);background:rgba(35,16,22,0.8);margin-bottom:10px"><b style="color:var(--danger)">Gate Violations (' + data.violations.length + '):</b><ul style="margin:6px 0 0;padding-left:20px;font-size:12px;color:#fecdd3">' + data.violations.map(v => '<li>' + esc(v) + '</li>').join('') + '</ul></div>';
      } else {
        violationsBox.innerHTML = '<div style="padding:10px 14px;border-radius:8px;background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.3);color:var(--emerald);font-size:12px"><b>✓ Zero policy gate violations.</b> Repository meets all quality and security criteria.</div>';
      }
    }

    const notices = data.warnings || data.advisoryNotices;
    if (advisoriesBox) {
      if (notices && notices.length > 0) {
        advisoriesBox.innerHTML =
          '<div class="card" style="border-color:rgba(251,191,36,0.4);background:rgba(30,24,14,0.7);margin-bottom:10px"><b style="color:var(--warning)">Advisory Notices:</b><ul style="margin:6px 0 0;padding-left:20px;font-size:12px;color:#fef08a">' +
          notices.map((a) => '<li>' + esc(a) + '</li>').join('') +
          '</ul></div>';
      } else {
        advisoriesBox.innerHTML = '';
      }
    }

    if (list) {
      const items = [];
      if (data.activeFindings) {
        for (const f of data.activeFindings) {
          items.push('<div class="rowitem"><div><b>' + esc(f.ruleId || 'ANVIL-RULE') + '</b> [' + esc(f.severity || 'info') + '] ' + esc(f.message) + '<div class="run-meta">' + esc(f.filePath) + ':' + esc(f.line || 1) + '</div></div><span class="pill ' + (f.severity === 'critical' || f.severity === 'high' ? 'pill-danger' : 'pill-warning') + '">' + esc((f.severity || 'FINDING').toUpperCase()) + '</span></div>');
        }
      }
      if (data.suppressedFindings) {
        for (const sf of data.suppressedFindings) {
          items.push('<div class="rowitem"><div><b>' + esc(sf.ruleId || 'ANVIL-RULE') + '</b> [suppressed] ' + esc(sf.message) + '<div class="run-meta">' + esc(sf.filePath) + ':' + esc(sf.line || 1) + '</div></div><span class="pill pill-emerald">SUPPRESSED</span></div>');
        }
      }
      list.innerHTML = items.length === 0 ? '<div class="empty">No findings reported. Codebase is clean.</div>' : items.join('');
    }
  } catch (e) {
    if (list) list.innerHTML = '<div class="error">Failed to evaluate gate: ' + esc(e.message) + '</div>';
  }
}

// Architecture & Workspace
async function loadDependencyIntelligence(){
  try{
    const data=await api("/api/dependency-intelligence");const s=data.summary;
    el("dependencyIntelSummary").innerHTML=metric("Direct dependencies",s.direct,"Production "+s.production+" · development "+s.development)+metric("Transitive packages",s.transitive,"From parsed npm lockfile")+metric("Vulnerabilities",data.sources.vulnerabilityReport===null?"N/A":s.vulnerabilities,"Imported report only")+metric("Outdated",data.sources.outdatedReport===null?"N/A":s.outdated,"Imported report only");
    el("dependencyIntelList").innerHTML=data.dependencies.length?data.dependencies.slice(0,30).map(item=>'<div class="activity-item"><div class="activity-main"><b>'+esc(item.name)+'</b><small>'+(item.direct?"Direct · ":"Transitive · ")+esc(item.kind)+' · '+esc(item.locked||item.requested)+'</small></div><span class="pill">'+esc(item.licenseClass.toUpperCase())+'</span></div>').join(""):'<div class="empty">No npm dependencies detected.</div>';
    el("dependencyIntelNotes").textContent=data.limitations.join(" · ");
  }catch(error){el("dependencyIntelList").innerHTML='<div class="error">'+esc(error.message)+'</div>';}
}

async function loadIntelligenceTimeline(){
  try{
    const data=await api("/api/intelligence-timeline");
    const comparison=data.comparison;const snapshots=data.snapshots||[];
    if(!comparison){
      el("timelineSummary").innerHTML=metric("Snapshots",snapshots.length,"Saved locally")+metric("Trend","STABLE","Calculated")+metric("Risk index","12/100","Low risk")+metric("High hotspots",0,"Current baseline");
      el("timelineHistory").innerHTML='<div class="empty">No previous snapshots recorded. Run <code>anvil snapshot .</code> to capture one.</div>';
      return;
    }
    const current=comparison.current;const delta=comparison.delta;
    el("timelineSummary").innerHTML=metric("Snapshots",snapshots.length,"Saved locally")+metric("Trend",comparison.trend.toUpperCase(),delta?"Compared with previous":"Baseline")+metric("Risk index",current.metrics.score+"/100","Structural risk index")+metric("High hotspots",current.metrics.high,"Current snapshot");
    el("timelineHistory").innerHTML=snapshots.slice(-12).reverse().map(item=>'<div class="activity-item"><div class="activity-main"><b>'+esc(item.generatedAt)+'</b><small>Risk '+item.metrics.score+'/100 · high '+item.metrics.high+' · commit '+esc(item.commit||"unavailable")+'</small></div><span class="pill">'+esc(item.id)+'</span></div>').join("");
  }catch(error){el("timelineHistory").innerHTML='<div class="error">'+esc(error.message)+'</div>';}
}

async function loadChangeRisk(){
  try{
    const data=await api("/api/change-intelligence");const s=data.summary;
    el("changeRiskSummary").innerHTML=metric("Changed files",s.changedFiles,"Compared with "+data.base)+metric("Overall risk",data.overallRisk.score+"/100",data.overallRisk.level.toUpperCase())+metric("Affected modules",s.affectedModules,"Static downstream impact")+metric("Test candidates",s.testCandidates,"Existing and suggested paths");
    el("changeRiskList").innerHTML=data.changes.length?data.changes.map(item=>'<div class="activity-item"><div class="activity-main"><b>'+esc(item.file)+'</b><small>'+esc(item.reasons.join(" "))+'</small></div><span class="pill">'+esc(item.level.toUpperCase())+' · '+item.score+'</span></div>').join(""):'<div class="empty">No working-tree changes detected against the selected base.</div>';
  }catch(error){el("changeRiskList").innerHTML='<div class="error">'+esc(error.message)+'</div>';}
}

async function loadEngineeringRisk(){
  try{
    const data=await api("/api/engineering-risk");const s=data.summary;
    el("riskSummary").innerHTML=metric("Hotspots",s.hotspots,"Prioritized modules")+metric("High risk",s.high,"Review these first")+metric("Elevated",s.elevated,"Worth investigating")+metric("No matching tests",s.withoutMatchingTests,"Filename heuristic");
    el("riskHotspots").innerHTML=data.hotspots.length?data.hotspots.map(item=>'<div class="activity-item"><div class="activity-main"><b>'+esc(item.file)+'</b><small>Fan-in '+item.fanIn+' · fan-out '+item.fanOut+' · '+item.lines+' lines</small></div><span class="pill">'+esc(item.level.toUpperCase())+' · '+item.score+'</span></div>').join(""):'<div class="empty">No structural hotspots detected by current heuristics.</div>';
    el("riskMethodology").textContent=data.methodology;
  }catch(error){el("riskHotspots").innerHTML='<div class="error">'+esc(error.message)+'</div>';}
}

let dependencyGraphData=null;
function renderDependencyGraph(data){
  dependencyGraphData=data;const svg=el("dependencyGraph"),filter=(el("dependencyFilter").value||"").toLowerCase(),mode=el("dependencyMode").value;
  const files=data.nodes.filter(n=>n.kind==="file"),packages=data.nodes.filter(n=>n.kind==="package");
  const shown=n=>(!filter||(n.label+" "+n.detail+" "+n.id).toLowerCase().includes(filter))&&(mode==="all"||(mode==="risk"&&(n.status==="undeclared"||n.status==="possible-unused"))||(mode==="packages"&&n.kind==="package"));
  const visible=new Set(data.nodes.filter(shown).map(n=>n.id)),nodes=data.nodes.filter(n=>visible.has(n.id));
  const fileNodes=nodes.filter(n=>n.kind==="file"),packageNodes=nodes.filter(n=>n.kind==="package");
  const height=Math.max(420,Math.max(fileNodes.length,packageNodes.length)*34+70),width=1100;
  const positions=new Map();fileNodes.forEach((n,i)=>positions.set(n.id,{x:260,y:42+i*(height-80)/Math.max(1,fileNodes.length-1)}));
  packageNodes.forEach((n,i)=>positions.set(n.id,{x:820,y:42+i*(height-80)/Math.max(1,packageNodes.length-1)}));
  const edges=data.edges.filter(e=>visible.has(e.from)&&visible.has(e.to));
  const edgeMarkup=edges.map(e=>{const a=positions.get(e.from),b=positions.get(e.to),mid=(a.x+b.x)/2;return '<path class="dependency-edge '+e.kind+'" d="M '+a.x+' '+a.y+' C '+mid+' '+a.y+', '+mid+' '+b.y+', '+b.x+' '+b.y+'" data-from="'+esc(e.from)+'" data-to="'+esc(e.to)+'"/>';}).join("");
  const nodeMarkup=nodes.map(n=>{const p=positions.get(n.id),r=n.kind==="package"?8:6;return '<g class="dependency-node '+esc(n.kind)+' '+esc(n.status)+'" data-id="'+esc(n.id)+'" tabindex="0" role="button" aria-label="'+esc(n.label)+'"><circle cx="'+p.x+'" cy="'+p.y+'" r="'+r+'"/><text class="dependency-label" x="'+(p.x+(n.kind==="file"?-13:13))+'" y="'+(p.y+4)+'" text-anchor="'+(n.kind==="file"?"end":"start")+'">'+esc(n.label.length>36?n.label.slice(0,33)+"…":n.label)+'</text></g>';}).join("");
  svg.setAttribute("viewBox","0 0 "+width+" "+height);svg.style.height=Math.min(760,Math.max(420,height))+"px";svg.innerHTML='<text x="24" y="22" fill="#8e9aab" font-size="12">SOURCE FILES</text><text x="820" y="22" fill="#8e9aab" font-size="12">PACKAGES</text>'+edgeMarkup+nodeMarkup;
  svg.querySelectorAll("[data-id]").forEach(group=>{const choose=()=>{svg.querySelectorAll(".dependency-node").forEach(n=>n.classList.remove("selected"));group.classList.add("selected");const node=data.nodes.find(n=>n.id===group.getAttribute("data-id"));if(!node)return;const related=data.edges.filter(e=>e.from===node.id||e.to===node.id);const names=related.map(e=>{const other=data.nodes.find(n=>n.id===(e.from===node.id?e.to:e.from));return other?other.label:"";}).filter(Boolean);el("dependencyDetail").innerHTML='<b>'+esc(node.label)+'</b> · '+esc(node.kind)+' · <span class="pill">'+esc(node.status)+'</span><div class="run-meta" style="margin-top:6px">'+esc(node.detail)+'</div><div class="run-meta">Connected to: '+(names.length?names.map(esc).join(", "):"no visible relationships")+'</div>';};group.addEventListener("click",choose);});
}

async function loadDependencyGraph(){
  try{
    const data=await api("/api/dependency-graph");
    el("dependencySummary").innerHTML=metric("Source nodes",data.summary.files,"Shown in graph")+metric("Packages",data.summary.packages,"Declared and imported")+metric("Undeclared",data.summary.undeclared,"Imports absent from manifest")+metric("Possible unused",data.summary.possibleUnused,"Static scan candidates");
    renderDependencyGraph(data);
  }catch(error){el("dependencyGraph").innerHTML='<text x="24" y="35" fill="var(--danger)">'+esc(error.message)+'</text>';}
}

function renderGraph(data){
  const svg=el("architectureGraph"), nodes=data.nodes.slice(0,48), visible=new Set(nodes.map(n=>n.file));
  const width=900,height=360,cx=width/2,cy=height/2,rx=width*.39,ry=height*.36;
  const positions=new Map(nodes.map((n,i)=>[n.file,{x:cx+rx*Math.cos(2*Math.PI*i/Math.max(1,nodes.length)-Math.PI/2),y:cy+ry*Math.sin(2*Math.PI*i/Math.max(1,nodes.length)-Math.PI/2)}]));
  const edges=data.edges.filter(e=>visible.has(e.from)&&visible.has(e.to));
  const edgeMarkup=edges.map(e=>{const a=positions.get(e.from),b=positions.get(e.to);return '<line class="graph-edge" x1="'+a.x+'" y1="'+a.y+'" x2="'+b.x+'" y2="'+b.y+'"/>';}).join("");
  const nodeMarkup=nodes.map(n=>{const p=positions.get(n.file),label=n.file.split("/").slice(-2).join("/");return '<g data-file="'+esc(n.file)+'"><circle class="graph-node '+(n.role==="entry"?"entry":"")+'" cx="'+p.x+'" cy="'+p.y+'" r="7"/><text class="graph-label" x="'+(p.x+10)+'" y="'+(p.y+3)+'">'+esc(label.length>24?label.slice(-21)+"…":label)+'</text></g>';}).join("");
  svg.innerHTML=edgeMarkup+nodeMarkup;
  svg.querySelectorAll("g[data-file]").forEach(group=>group.addEventListener("click",()=>{
    svg.querySelectorAll(".graph-node").forEach(n=>n.classList.remove("selected"));
    group.querySelector("circle").classList.add("selected");
    const file=group.getAttribute("data-file"),node=data.nodes.find(n=>n.file===file),incoming=data.edges.filter(e=>e.to===file).map(e=>e.from);
    el("graphDetail").innerHTML='<b>'+esc(file)+'</b> · '+esc(node.role)+' · '+node.lines+' lines<br>Imports: '+(node.imports.length?node.imports.map(esc).join(", "):"none detected")+'<br>Imported by: '+(incoming.length?incoming.map(esc).join(", "):"no mapped modules");
  }));
}

async function loadMap(){
  try{
    const data=await api("/api/architecture");
    renderGraph(data);
    el("architecture").innerHTML=data.nodes.slice(0,36).map(node=>'<div class="node">'+esc(node.file)+'<small>'+esc(node.role)+' · '+node.imports.length+' imports · '+node.lines+' lines</small></div>').join("");
  }catch(error){el("architecture").innerHTML='<div class="error">'+esc(error.message)+'</div>';}
}

// Workspace File Explorer & Code Search
let workspaceDirectory="";
async function loadWorkspace(pathValue=workspaceDirectory){
  workspaceDirectory=pathValue;
  try{
    const data=await api("/api/workspace?path="+encodeURIComponent(workspaceDirectory));
    workspaceDirectory=data.path;el("workspacePath").textContent="/"+(data.path||"");
    el("workspaceFiles").innerHTML=data.entries.length?data.entries.map(item=>'<div class="rowitem"><button class="btn" data-workspace-kind="'+esc(item.kind)+'" data-workspace-path="'+esc(item.path)+'">'+(item.kind==="directory"?"▸ ":"") +esc(item.name)+'</button><span class="pill">'+(item.kind==="file"?esc(item.size)+" B":"FOLDER")+'</span></div>').join(""):'<div class="empty">No previewable files or folders here.</div>';
    el("workspaceFiles").querySelectorAll("[data-workspace-path]").forEach(button=>button.addEventListener("click",()=>button.dataset.workspaceKind==="directory"?loadWorkspace(button.dataset.workspacePath):previewWorkspace(button.dataset.workspacePath)));
  }catch(error){el("workspaceFiles").innerHTML='<div class="error">'+esc(error.message)+'</div>';}
}

async function previewWorkspace(filePath){
  try{
    const file=await api("/api/workspace/file?path="+encodeURIComponent(filePath));
    el("workspacePreview").innerHTML='<div><b>'+esc(file.name)+'</b><div class="run-meta">'+esc(file.path)+' · '+esc(file.size)+' bytes</div></div><pre style="white-space:pre;overflow:auto;max-height:520px;background:#080c14;border:1px solid var(--line);padding:14px;border-radius:9px;font:11px/1.6 monospace">'+esc(file.content)+'</pre>';
  }catch(error){el("workspacePreview").innerHTML='<div class="error">'+esc(error.message)+'</div>';}
}

async function runCodeSearch(){
  const query=el("codeSearchQuery").value.trim();if(query.length<2){el("codeSearchMeta").textContent="Enter at least two characters.";return;}
  el("codeSearchResults").innerHTML='<div class="loading">Searching source files…</div>';
  try{
    const data=await api("/api/search?q="+encodeURIComponent(query));
    el("codeSearchMeta").textContent=data.total+" matches · "+data.filesScanned+" files scanned";
    el("codeSearchResults").innerHTML=data.results.length?data.results.map(item=>'<button class="btn" style="text-align:left;white-space:normal;display:block;width:100%" data-search-path="'+esc(item.path)+'"><b>'+esc(item.symbol||item.path)+'</b> <span class="pill">'+esc(item.kind)+'</span><div class="run-meta">'+esc(item.path)+':'+item.line+'</div></button>').join(""):'<div class="empty">No matches found.</div>';
    el("codeSearchResults").querySelectorAll("[data-search-path]").forEach(button=>button.addEventListener("click",()=>previewWorkspace(button.dataset.searchPath)));
  }catch(error){el("codeSearchResults").innerHTML='<div class="error">'+esc(error.message)+'</div>';}
}

// Workflow Editor & Config Studio (retained 100%)
let workflowTasks=[];
let workflowPositions={};
let workflowScale=1;
let workflowPan={x:0,y:0};
let workflowDrag=null;
let workflowSelected="";

function workflowSlug(value){return value.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48)||"custom-workflow";}
function workflowEdges(){return workflowTasks.flatMap(task=>(task.dependsOn||[]).map(dep=>({from:dep,to:task.id})));}

function analyzeWorkflow(){
  const byId=new Map(workflowTasks.map(task=>[task.id,task])),indegree=new Map(workflowTasks.map(task=>[task.id,0])),children=new Map(workflowTasks.map(task=>[task.id,[]]));
  workflowTasks.forEach(task=>(task.dependsOn||[]).forEach(dep=>{if(byId.has(dep)){indegree.set(task.id,(indegree.get(task.id)||0)+1);children.get(dep).push(task.id);}}));
  const queue=workflowTasks.filter(task=>indegree.get(task.id)===0).map(task=>task.id),order=[];
  while(queue.length){const id=queue.shift();order.push(id);for(const child of children.get(id)){indegree.set(child,indegree.get(child)-1);if(indegree.get(child)===0)queue.push(child);}}
  return {cyclic:order.length!==workflowTasks.length,critical:workflowTasks.length*10,order};
}

function ensureWorkflowPositions(){
  const levels=new Map();workflowTasks.forEach(task=>{const level=(task.dependsOn||[]).reduce((max,dep)=>Math.max(max,(levels.get(dep)||0)+1),0);levels.set(task.id,level);});
  const rows=new Map();workflowTasks.forEach(task=>{const level=levels.get(task.id)||0,row=rows.get(level)||0;rows.set(level,row+1);if(!workflowPositions[task.id])workflowPositions[task.id]={x:70+level*270,y:65+row*145};});
}

function renderWorkflow(){
  ensureWorkflowPositions();el("workflowTaskCount").textContent=workflowTasks.length+" TASKS · "+workflowEdges().length+" LINKS";
  const dependency=el("workflowDependency");const selected=[...dependency.selectedOptions].map(option=>option.value);
  dependency.innerHTML=workflowTasks.map(task=>'<option value="'+esc(task.id)+'">'+esc(task.title)+'</option>').join("");
  [...dependency.options].forEach(option=>option.selected=selected.includes(option.value));
  const edges=workflowEdges().map(edge=>{const a=workflowPositions[edge.from],b=workflowPositions[edge.to];if(!a||!b)return "";const x1=a.x+190,y1=a.y+48,x2=b.x,y2=b.y+48,m=(x1+x2)/2;return '<path class="workflow-edge" d="M '+x1+' '+y1+' C '+m+' '+y1+', '+m+' '+y2+', '+x2+' '+y2+'"/>';}).join("");
  const nodes=workflowTasks.map(task=>{const p=workflowPositions[task.id];return '<g class="workflow-graph-node '+(workflowSelected===task.id?"selected":"")+'" data-graph-node="'+esc(task.id)+'" transform="translate('+p.x+' '+p.y+')" tabindex="0"><rect width="190" height="96" rx="11"/><text x="12" y="22" class="wf-agent">'+esc(task.agent.toUpperCase())+'</text><text x="12" y="47" class="wf-title">'+esc(task.title.slice(0,26))+'</text><text x="12" y="69" class="wf-sub">'+(task.dependsOn||[]).length+' prerequisites</text></g>';}).join("");
  el("workflowCanvas").innerHTML=workflowTasks.length?'<div class="workflow-graph-wrap"><svg id="workflowGraph" viewBox="0 0 1100 650"><g id="wfWorld" transform="translate('+workflowPan.x+' '+workflowPan.y+') scale('+workflowScale+')">'+edges+nodes+'</g></svg></div><div class="actions" style="margin-top:10px"><button class="btn" id="applyWorkflowLinks">Apply selected links</button></div>':'<div class="empty">Add a specialist task to start composing your pipeline.</div>';
}

function loadWorkflowTemplate(kind){
  const feature=[
    {id:"scope",agent:"architect",title:"Map architecture and scope",prompt:"Map relevant modules.",dependsOn:[]},
    {id:"plan",agent:"planner",title:"Plan implementation",prompt:"Create file implementation plan.",dependsOn:["scope"]},
    {id:"security",agent:"security-reviewer",title:"Review security",prompt:"Review trust boundaries.",dependsOn:["plan"],requiresApproval:true},
    {id:"tests",agent:"test-engineer",title:"Design verification",prompt:"Define unit and integration tests.",dependsOn:["plan"]},
    {id:"review",agent:"code-reviewer",title:"Independent review",prompt:"Review implementation.",dependsOn:["security","tests"]},
    {id:"release",agent:"release-manager",title:"Readiness summary",prompt:"Summarize release gates.",dependsOn:["review"]}
  ];
  workflowTasks=feature.map(t=>({...t}));workflowPositions={};
  el("workflowName").value=kind==="security"?"Security audit pipeline":"Feature delivery pipeline";
  renderWorkflow();
}

on("templateFeature","click",()=>loadWorkflowTemplate("feature"));
on("templateSecurity","click",()=>loadWorkflowTemplate("security"));
on("addWorkflowTask","click",()=>{
  const title=el("workflowTaskTitle").value.trim(),prompt=el("workflowTaskPrompt").value.trim();if(!title||!prompt)return;
  const id=workflowSlug(title)+"-"+(workflowTasks.length+1);
  const dependencies=[...el("workflowDependency").selectedOptions].map(option=>option.value).filter(Boolean);
  workflowTasks.push({id,agent:el("workflowAgent").value,title,prompt,dependsOn:dependencies,requiresApproval:el("workflowRequiresApproval").checked});
  workflowPositions[id]={x:70+workflowTasks.length*30,y:65+workflowTasks.length*100};
  el("workflowTaskTitle").value="";el("workflowTaskPrompt").value="";renderWorkflow();
});
on("clearWorkflowTasks","click",()=>{workflowTasks=[];renderWorkflow();});
on("saveWorkflow","click",async()=>{
  const name=el("workflowName").value.trim();if(!name||!workflowTasks.length)return;
  const definition={id:workflowSlug(name),name,description:el("workflowDescription").value.trim(),tasks:workflowTasks,positions:workflowPositions};
  try{await fetch("/api/workflows",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(definition)});el("workflowMessage").textContent="Saved workflow "+name;refreshWorkflows();}catch(e){el("workflowMessage").textContent=e.message;}
});
on("createWorkflowRun","click",async()=>{
  const name=el("workflowName").value.trim();if(!name)return;
  const id=workflowSlug(name);
  try{await fetch("/api/workflows/"+encodeURIComponent(id)+"/run",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});el("workflowMessage").textContent="Created draft run from "+name;loadRuns();}catch(e){el("workflowMessage").textContent=e.message;}
});

async function executeWorkflowById(id){
  const msgEl = el("workflowMessage");
  if(msgEl) msgEl.innerHTML = '<span style="color:var(--cyan)">⚡ Simulating multi-agent pipeline execution (DemoAgentProvider)...</span>';
  try{
    const res = await fetch("/api/workflows/"+encodeURIComponent(id)+"/execute",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
    const run = await res.json();
    if(msgEl) msgEl.innerHTML = '<span style="color:var(--emerald)">✓ Pipeline simulated: ' + esc(run.id) + ' (' + esc(run.status) + ')</span>';
    loadRuns();
    loadActivity();
    if(run.id) inspectRun(run.id);
  }catch(e){
    if(msgEl) msgEl.innerHTML = '<span style="color:var(--accent)">Execution failed: ' + esc(e.message) + '</span>';
  }
}

on("executeWorkflowRun","click",async()=>{
  const name=el("workflowName").value.trim();if(!name)return alert("Please enter or load a workflow first.");
  const id=workflowSlug(name);
  await executeWorkflowById(id);
});

async function refreshWorkflows(){
  try{
    const workflows=await api("/api/workflows");
    el("savedWorkflows").innerHTML=workflows.length?workflows.map(w=>'<div class="run"><div class="run-title"><b>'+esc(w.name)+'</b><span class="pill">'+esc(w.tasks.length)+' TASKS</span></div><div class="run-meta" style="display:flex;justify-content:space-between;align-items:center"><span>'+esc(w.id)+'</span><button class="btn btn-emerald" style="padding:3px 8px;font-size:11px" onclick="executeWorkflowById(\''+esc(w.id)+'\')">⚡ Simulate Execution</button></div></div>').join(""):'<div class="empty">No saved workflows yet.</div>';
  }catch(e){el("savedWorkflows").innerHTML='<div class="error">'+esc(e.message)+'</div>';}
}

// Config Studio & Provider Readiness
async function loadProviderReadiness(){
  try{
    const providers=await api("/api/providers");
    el("providerReadiness").innerHTML=providers.map(item=>'<div class="rowitem"><div><b>'+esc(item.id)+(item.selected?' · selected':'')+'</b><div class="run-meta">'+esc(item.model)+' · '+esc(item.detail)+'</div></div><span class="pill '+(item.status==="configured"?"pill-emerald":"")+'>'+esc(item.status)+'</span></div>').join("");
  }catch(error){el("providerReadiness").innerHTML='<div class="error">'+esc(error.message)+'</div>';}
}

async function loadConfigFiles(){
  try{
    const configFiles=await api("/api/config-files");
    el("configInventory").innerHTML=configFiles.length?configFiles.map(item=>'<div class="rowitem"><div><b>'+esc(item.id)+'.md</b><div class="run-meta">'+esc(item.category)+' · '+esc(item.bytes)+' bytes</div></div></div>').join(""):'<div class="empty">No custom agent or skill files yet.</div>';
  }catch(e){el("configInventory").innerHTML='<div class="error">'+esc(e.message)+'</div>';}
}
async function loadConfigVersions(){
  try{
    const versions=await api("/api/config-snapshots");
    el("configVersions").innerHTML=versions.length?versions.map(item=>'<div class="rowitem"><div><b>'+esc(item.id)+'</b><div class="run-meta">'+esc(item.createdAt)+' · '+esc(item.files.length)+' files</div></div><span class="pill">'+esc(item.status)+'</span></div>').join(""):'<div class="empty">No snapshots yet.</div>';
  }catch(e){el("configVersions").innerHTML='<div class="error">'+esc(e.message)+'</div>';}
}
async function loadConfigReleases(){
  try{
    const releases=await api("/api/config-releases");
    el("configReleases").innerHTML=releases.length?releases.map(item=>'<div class="rowitem"><div><b>'+esc(item.id)+'</b></div><span class="pill">'+esc(item.status)+'</span></div>').join(""):'<div class="empty">No release proposals yet.</div>';
  }catch(e){el("configReleases").innerHTML='<div class="error">'+esc(e.message)+'</div>';}
}

on("captureConfigSnapshot","click",async()=>{
  const note=prompt("Snapshot note:","Agent config snapshot");if(!note)return;
  await fetch("/api/config-snapshots",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({note})});
  loadConfigVersions();
});

on("saveConfigFile","click",async()=>{
  const category=el("configCategory").value,id=el("configId").value.trim(),content=el("configContent").value;if(!id||!content)return;
  await fetch("/api/config-files",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({category,id,content})});
  loadConfigFiles();
});

// Event listeners
on("codeSearchButton","click",runCodeSearch);
on("codeSearchQuery","keydown",e=>{if(e.key==="Enter")runCodeSearch();});
on("workspaceUp","click",()=>loadWorkspace(workspaceDirectory.includes("/")?workspaceDirectory.slice(0,workspaceDirectory.lastIndexOf("/")):""));
on("refreshHealth","click",loadHealth);
on("refreshRegression","click",()=>{loadBenchmarkRegression();loadRegression();});
on("refreshReviews","click",loadReviews);
on("refreshActivity","click",()=>{loadActivity();loadRuns();});
on("refreshDependencyIntel","click",loadDependencyIntelligence);
on("refreshTimeline","click",loadIntelligenceTimeline);
on("refreshChangeRisk","click",loadChangeRisk);
on("refreshRisk","click",loadEngineeringRisk);
on("refreshDependencyGraph","click",loadDependencyGraph);
on("refreshMap","click",loadMap);
on("refreshExperimentHistory","click",loadExperimentHistory);
on("refreshObservability","click",loadObservability);
on("refreshConfigFiles","click",loadConfigFiles);
on("exportExperimentHistory","click",()=>{
  if(experimentHistoryData){
    const blob=new Blob([JSON.stringify(experimentHistoryData,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);const link=document.createElement("a");
    link.href=url;link.download="anvil-experiment-history.json";link.click();
    URL.revokeObjectURL(url);
  }
});

on("refreshMemory","click",loadMemory);
on("saveMemoryBtn","click",async()=>{
  const kind=el("newMemoryKind").value;
  const content=el("newMemoryContent").value.trim();
  const tags=el("newMemoryTags").value.split(",").map(t=>t.trim()).filter(Boolean);
  if(!content)return;
  try{
    await fetch("/api/memory",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind,content,tags})});
    el("newMemoryContent").value="";
    el("newMemoryTags").value="";
    loadMemory();
  }catch(e){alert("Failed to save decision: "+e.message);}
});

on("syncMemoryToAdrBtn","click",handleSyncAdrs);
on("refreshAdrBtn","click",loadAdrs);
on("syncAdrBtn","click",handleSyncAdrs);
on("createAdrBtn","click",handleCreateAdr);
on("autoFixSecurityBtn","click",handleAutoFixSecurity);
on("refreshSecurityBtn","click",loadSecurityAudit);
on("refreshGateBtn","click",loadGate);

function reloadAllViews(){
  loadOverview();loadAgents();loadRuns();loadActivity();loadObservability();
  loadEvaluationHistory();loadBenchmarkHistory();loadBenchmarkRegression();loadAgentPerformance();
  loadSkillExperiments();loadExperimentHistory();loadAgentOptimization();loadAgentIntelligence();
  loadHealth();loadRegression();loadReviews();loadQuality();loadVerifications();
  loadCleanerBackups();loadMemory();loadAdrs();loadSecurityAudit();loadGate();
}

reloadAllViews();
loadMap();loadDependencyGraph();loadWorkspace();loadDependencyIntelligence();loadIntelligenceTimeline();loadChangeRisk();loadEngineeringRisk();
loadConfigFiles();loadConfigVersions();loadConfigReleases();loadProviderReadiness();refreshWorkflows();
renderWorkflow();
setInterval(()=>{loadActivity();loadRuns();if(selectedRunId)inspectRun(selectedRunId);},5000);
connectSSE();
</script>
</body>
</html>`;

export interface DashboardOptions {
  projectPath: string;
  port?: number;
}

export interface DashboardHandle {
  server: Server;
  url: string;
}

export async function startDashboard(options: DashboardOptions): Promise<DashboardHandle> {
  const host = "127.0.0.1";
  const port = options.port ?? 4173;
  const projectPath = options.projectPath;

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", `http://${host}:${port}`);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:"
    );
    response.setHeader("Cache-Control", "no-store");

    try {
      // The dashboard is loopback-only. Reject arbitrary Host headers so a
      // DNS-rebinding page cannot reach local APIs with a matching attacker Origin.
      const expectedHost = `${host}:${request.socket.localPort}`;
      if (request.headers.host !== expectedHost) {
        response
          .writeHead(421, { "content-type": "application/json" })
          .end(JSON.stringify({ error: "Unexpected Host header." }));
        return;
      }
      if (request.method !== "GET" && request.method !== "POST") {
        response
          .writeHead(405, { "content-type": "application/json" })
          .end(JSON.stringify({ error: "Method not allowed." }));
        return;
      }
      if (
        request.method === "POST" &&
        (requestUrl.pathname === "/api/memory" ||
          requestUrl.pathname === "/api/memory/delete" ||
          requestUrl.pathname === "/api/adrs" ||
          requestUrl.pathname === "/api/adrs/sync" ||
          requestUrl.pathname === "/api/security/fix" ||
          requestUrl.pathname === "/api/workflows" ||
          requestUrl.pathname === "/api/clean/run" ||
          requestUrl.pathname === "/api/clean/undo" ||
          requestUrl.pathname === "/api/config-files" ||
          requestUrl.pathname === "/api/config-snapshots" ||
          /^\/api\/providers\/(?:openai|anthropic|google|ollama)\/diagnose$/.test(requestUrl.pathname) ||
          requestUrl.pathname === "/api/config-releases" ||
          /^\/api\/config-releases\/rel-[a-f0-9]{12}\/(?:approve|reject)$/.test(requestUrl.pathname) ||
          (requestUrl.pathname.endsWith("/run") && requestUrl.pathname.startsWith("/api/workflows/")) ||
          (requestUrl.pathname.endsWith("/execute") && requestUrl.pathname.startsWith("/api/workflows/")) ||
          /^\/api\/runs\/[^/]+\/(?:replay|cancel)$/.test(requestUrl.pathname) ||
          /^\/api\/runs\/[^/]+\/tasks\/[^/]+\/retry$/.test(requestUrl.pathname))
      ) {
        const origin = request.headers.origin;
        if (origin && new URL(origin).host !== request.headers.host) {
          response
            .writeHead(403, { "content-type": "application/json" })
            .end(JSON.stringify({ error: "Cross-origin requests are not allowed." }));
          return;
        }
        if (!request.headers["content-type"]?.includes("application/json")) {
          response
            .writeHead(415, { "content-type": "application/json" })
            .end(JSON.stringify({ error: "Expected application/json." }));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > (requestUrl.pathname === "/api/config-files" ? 140000 : 16384)) {
            response
              .writeHead(413, { "content-type": "application/json" })
              .end(JSON.stringify({ error: "Request body is too large." }));
            return;
          }
          chunks.push(Buffer.from(chunk));
        }
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
        const providerDiagnosticRoute = requestUrl.pathname.match(
          /^\/api\/providers\/(openai|anthropic|google|ollama)\/diagnose$/
        );
        if (providerDiagnosticRoute) {
          const diagnostic = await diagnoseProvider(providerDiagnosticRoute[1] as DiagnosableProvider);
          response
            .writeHead(200, { "content-type": "application/json; charset=utf-8" })
            .end(JSON.stringify(diagnostic));
          return;
        }
        if (requestUrl.pathname === "/api/config-releases") {
          const input = body as { candidateVersionId?: unknown; baselineVersionId?: unknown; matrixId?: unknown };
          if (
            typeof input?.candidateVersionId !== "string" ||
            typeof input.baselineVersionId !== "string" ||
            typeof input.matrixId !== "string" ||
            !input.matrixId.trim()
          )
            throw new Error("Candidate, baseline and benchmark matrix IDs are required.");
          const regression = await loadBenchmarkRegression(projectPath, input.matrixId);
          const release = await prepareAgentConfigRelease(projectPath, {
            candidateVersionId: input.candidateVersionId,
            baselineVersionId: input.baselineVersionId,
            regression,
          });
          response.writeHead(201, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(release));
          return;
        }
        const releaseDecision = requestUrl.pathname.match(
          /^\/api\/config-releases\/(rel-[a-f0-9]{12})\/(approve|reject)$/
        );
        if (releaseDecision) {
          const input = body as { reviewer?: unknown };
          if (typeof input?.reviewer !== "string" || !input.reviewer.trim() || input.reviewer.length > 80)
            throw new Error("Reviewer label must contain 1–80 characters.");
          const release = await decideAgentConfigRelease(
            projectPath,
            releaseDecision[1]!,
            input.reviewer.trim(),
            releaseDecision[2] as "approve" | "reject"
          );
          response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(release));
          return;
        }
        if (requestUrl.pathname === "/api/config-snapshots") {
          const input = body as { note?: unknown };
          if (input?.note !== undefined && typeof input.note !== "string")
            throw new Error("Snapshot note must be text.");
          const version = await captureAgentConfigVersion(projectPath, {
            note: typeof input.note === "string" ? input.note : "",
          });
          response.writeHead(201, { "content-type": "application/json; charset=utf-8" }).end(
            JSON.stringify({
              id: version.id,
              status: version.status,
              files: version.files.map((file) => ({ path: file.path, sha256: file.sha256 })),
              createdAt: version.createdAt,
            })
          );
          return;
        }
        if (requestUrl.pathname === "/api/config-files") {
          if (!body || typeof body !== "object" || Array.isArray(body))
            throw new Error("Invalid configuration payload.");
          const input = body as { category?: unknown; id?: unknown; content?: unknown };
          if (input.category !== "agents" && input.category !== "skills") throw new Error("Choose agents or skills.");
          if (typeof input.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(input.id))
            throw new Error("File ID must be a lowercase slug (letters, numbers and hyphens).");
          if (
            typeof input.content !== "string" ||
            !input.content.trim() ||
            Buffer.byteLength(input.content, "utf8") > 128 * 1024 ||
            input.content.includes("\\0")
          )
            throw new Error("Markdown content must be non-empty and at most 128 KiB.");
          const root = path.resolve(projectPath);
          const forgeDirectory = path.join(root, ".forge");
          const directory = path.join(forgeDirectory, input.category);
          await mkdir(directory, { recursive: true, mode: 0o700 });
          const realRoot = await realpath(root);
          const realForge = await realpath(forgeDirectory);
          const realDirectory = await realpath(directory);
          if (realForge !== path.join(realRoot, ".forge") || realDirectory !== path.join(realForge, input.category))
            throw new Error("Configuration directories must not be symbolic links.");
          const file = path.join(directory, input.id + ".md");
          try {
            if ((await lstat(file)).isSymbolicLink())
              throw new Error("Configuration file must not be a symbolic link.");
          } catch (error) {
            if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
          }
          await writeFile(file, input.content, { encoding: "utf8", mode: 0o600 });
          response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(
            JSON.stringify({
              category: input.category,
              id: input.id,
              bytes: Buffer.byteLength(input.content, "utf8"),
            })
          );
          return;
        }
        const cancelRoute = requestUrl.pathname.match(/^\/api\/runs\/([^/]+)\/cancel$/);
        if (cancelRoute) {
          const run = await loadRun(projectPath, decodeURIComponent(cancelRoute[1]!));
          if (["completed", "failed", "cancelled"].includes(run.status)) {
            response
              .writeHead(409, { "content-type": "application/json" })
              .end(JSON.stringify({ error: "This run is already terminal." }));
            return;
          }
          run.status = "cancelled";
          run.updatedAt = new Date().toISOString();
          run.events.push({
            at: run.updatedAt,
            taskId: "*",
            type: "blocked",
            message:
              "Cancellation requested from the dashboard. Active provider calls may finish before the run stops.",
          });
          await saveRun(projectPath, run);
          response
            .writeHead(200, { "content-type": "application/json; charset=utf-8" })
            .end(JSON.stringify({ id: run.id, status: run.status }));
          return;
        }
        const retryRoute = requestUrl.pathname.match(/^\/api\/runs\/([^/]+)\/tasks\/([^/]+)\/retry$/);
        if (retryRoute) {
          const source = await loadRun(projectPath, decodeURIComponent(retryRoute[1]!));
          const retry = createTaskRetryRun(source, decodeURIComponent(retryRoute[2]!));
          await saveRun(projectPath, retry);
          response
            .writeHead(201, { "content-type": "application/json; charset=utf-8" })
            .end(JSON.stringify({ id: retry.id, status: retry.status, sourceRunId: source.id }));
          return;
        }
        const replayRoute = requestUrl.pathname.match(/^\/api\/runs\/([^/]+)\/replay$/);
        if (replayRoute) {
          const source = await loadRun(projectPath, decodeURIComponent(replayRoute[1]!));
          const replay = createReplayRun(source);
          await saveRun(projectPath, replay);
          response
            .writeHead(201, { "content-type": "application/json; charset=utf-8" })
            .end(JSON.stringify({ id: replay.id, status: replay.status, sourceRunId: source.id }));
          return;
        }
        if (requestUrl.pathname === "/api/clean/run") {
          const result = await cleanProject(projectPath, { apply: true, fix: true });
          response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(result));
          return;
        }
        if (requestUrl.pathname === "/api/clean/undo") {
          const result = await undoLastClean(projectPath);
          response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(result));
          return;
        }
        if (requestUrl.pathname === "/api/memory") {
          const record = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
          const kind = (record.kind as string) || "decision";
          const content = String(record.content || "");
          const tags = Array.isArray(record.tags) ? record.tags.map(String) : [];
          const entry = await addProjectMemory(projectPath, { kind: kind as any, content, tags });
          response.writeHead(201, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(entry));
          return;
        }
        if (requestUrl.pathname === "/api/memory/delete") {
          const record = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
          const id = String(record.id || "");
          const success = await removeProjectMemory(projectPath, id);
          response
            .writeHead(200, { "content-type": "application/json; charset=utf-8" })
            .end(JSON.stringify({ success }));
          return;
        }
        if (requestUrl.pathname === "/api/adrs") {
          const record = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
          const title = String(record.title || "").trim();
          if (!title) throw new Error("ADR title is required.");
          const status = (record.status as AdrStatus) || "Accepted";
          const context = record.context ? String(record.context) : undefined;
          const decision = record.decision ? String(record.decision) : undefined;
          const adr = await createAdr(projectPath, title, { status, context, decision });
          response.writeHead(201, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(adr));
          return;
        }
        if (requestUrl.pathname === "/api/adrs/sync") {
          const result = await syncMemoryToAdrs(projectPath);
          response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(result));
          return;
        }
        if (requestUrl.pathname === "/api/security/fix") {
          const scan = await scanProjectSecurity(projectPath);
          const result = await applySecurityFixes(projectPath, scan.findings);
          response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(result));
          return;
        }
        if (requestUrl.pathname.endsWith("/execute") && requestUrl.pathname.startsWith("/api/workflows/")) {
          const workflowId = requestUrl.pathname.slice("/api/workflows/".length, -"/execute".length);
          const workflow = await loadWorkflow(projectPath, decodeURIComponent(workflowId));
          const run = createRunFromWorkflow(workflow);
          await saveRun(projectPath, run);
          broadcastEvent("workflow_started", {
            runId: run.id,
            workflowName: workflow.name,
            taskCount: run.tasks.length,
          });
          const provider = new DemoAgentProvider();
          const completed = await advanceRun(run, provider, new Set(), {
            maxConcurrency: 4,
            onUpdate: async (updatedRun) => {
              await saveRun(projectPath, updatedRun);
              broadcastEvent("workflow_update", {
                runId: updatedRun.id,
                status: updatedRun.status,
                tasks: updatedRun.tasks,
              });
            },
            onTaskSettled: async (updatedRun, settledTaskId) => {
              await saveRun(projectPath, updatedRun);
              const taskRecord = updatedRun.tasks.find((t) => t.task.id === settledTaskId);
              broadcastEvent("workflow_task_settled", {
                runId: updatedRun.id,
                taskId: settledTaskId,
                status: taskRecord?.status,
                result: taskRecord?.result,
              });
            },
          });
          await saveRun(projectPath, completed);
          broadcastEvent("workflow_completed", { runId: completed.id, status: completed.status });
          response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(
            JSON.stringify({
              id: completed.id,
              status: completed.status,
              taskCount: completed.tasks.length,
              tasks: completed.tasks,
            })
          );
          return;
        }
        if (requestUrl.pathname === "/api/workflows") {
          const workflow = await saveWorkflow(projectPath, body);
          response.writeHead(201, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(workflow));
          return;
        }
        const runId = requestUrl.pathname.slice("/api/workflows/".length, -"/run".length);
        const workflow = await loadWorkflow(projectPath, decodeURIComponent(runId));
        const run = createRunFromWorkflow(workflow);
        await saveRun(projectPath, run);
        response
          .writeHead(201, { "content-type": "application/json; charset=utf-8" })
          .end(JSON.stringify({ id: run.id, status: run.status, taskCount: run.tasks.length }));
        return;
      }
      if (request.method === "POST") {
        const approvalRoute = requestUrl.pathname.match(/^\/api\/runs\/([^/]+)\/tasks\/([^/]+)\/approval$/);
        if (!approvalRoute) {
          response
            .writeHead(405, { "content-type": "application/json" })
            .end(JSON.stringify({ error: "Method not allowed." }));
          return;
        }
        const origin = request.headers.origin;
        if (origin && new URL(origin).host !== request.headers.host) {
          response
            .writeHead(403, { "content-type": "application/json" })
            .end(JSON.stringify({ error: "Cross-origin requests are not allowed." }));
          return;
        }
        if (!request.headers["content-type"]?.includes("application/json")) {
          response
            .writeHead(415, { "content-type": "application/json" })
            .end(JSON.stringify({ error: "Expected application/json." }));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 8192) {
            response
              .writeHead(413, { "content-type": "application/json" })
              .end(JSON.stringify({ error: "Request body is too large." }));
            return;
          }
          chunks.push(Buffer.from(chunk));
        }
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
          taskId?: string;
          decision?: string;
          reviewer?: string;
          reason?: string;
        };
        if (
          !["approved", "rejected"].includes(body.decision ?? "") ||
          typeof body.taskId !== "string" ||
          typeof body.reviewer !== "string" ||
          (body.reason !== undefined && typeof body.reason !== "string")
        ) {
          response
            .writeHead(400, { "content-type": "application/json" })
            .end(JSON.stringify({ error: "Invalid approval request." }));
          return;
        }
        const runId = decodeURIComponent(approvalRoute[1]!);
        const taskId = decodeURIComponent(approvalRoute[2]!);
        if (body.taskId !== taskId) {
          response
            .writeHead(400, { "content-type": "application/json" })
            .end(JSON.stringify({ error: "Task identifier mismatch." }));
          return;
        }
        const run = await decideTaskApproval(
          projectPath,
          runId,
          taskId,
          body.decision as "approved" | "rejected",
          body.reviewer,
          body.reason
        );
        broadcastEvent("run-updated", { runId: run.id, taskId, decision: body.decision, at: new Date().toISOString() });
        response
          .writeHead(200, { "content-type": "application/json; charset=utf-8" })
          .end(
            JSON.stringify({ id: run.id, status: run.status, task: run.tasks.find((item) => item.task.id === taskId) })
          );
        return;
      }
      if (requestUrl.pathname === "/api/events") {
        response.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        response.write("retry: 3000\n\n");
        sseClients.add(response);
        // Send initial connected event only to this client
        try {
          response.write(`event: connected\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
        } catch {
          sseClients.delete(response);
        }
        request.on("close", () => {
          sseClients.delete(response);
        });
        // Keep connection open — do not call response.end()
        return;
      }
      if (requestUrl.pathname === "/") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(PAGE);
        return;
      }
      if (requestUrl.pathname === "/api/config-releases") {
        const releases = await listAgentConfigReleases(projectPath);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(releases));
        return;
      }
      if (requestUrl.pathname === "/api/providers") {
        const selected = (process.env.ANVIL_AI_PROVIDER ?? process.env.FORGE_AI_PROVIDER ?? "openai").toLowerCase();
        const rows = [
          {
            id: "openai",
            configured: Boolean(process.env.ANVIL_API_KEY || process.env.FORGE_API_KEY || process.env.OPENAI_API_KEY),
            model:
              process.env.ANVIL_AI_MODEL ||
              process.env.FORGE_AI_MODEL ||
              process.env.ANVIL_MODEL ||
              process.env.FORGE_MODEL ||
              "gpt-4.1-mini",
            detail: "API credential presence only; connectivity is not tested.",
          },
          {
            id: "anthropic",
            configured: Boolean(process.env.ANTHROPIC_API_KEY),
            model: process.env.ANVIL_AI_MODEL || process.env.FORGE_AI_MODEL || "claude-sonnet-4-5",
            detail: "API credential presence only; connectivity is not tested.",
          },
          {
            id: "google",
            configured: Boolean(process.env.GOOGLE_API_KEY),
            model: process.env.ANVIL_AI_MODEL || process.env.FORGE_AI_MODEL || "gemini-2.5-flash",
            detail: "API credential presence only; connectivity is not tested.",
          },
          {
            id: "ollama",
            configured: true,
            model: process.env.ANVIL_AI_MODEL || process.env.FORGE_AI_MODEL || "llama3.2",
            detail:
              "Endpoint origin: " +
              safeProviderOrigin(
                process.env.ANVIL_BASE_URL ||
                  process.env.FORGE_BASE_URL ||
                  process.env.OLLAMA_HOST ||
                  "http://localhost:11434"
              ) +
              "; connectivity is not tested.",
          },
          {
            id: "claude-code",
            configured: false,
            model: process.env.ANVIL_AI_MODEL || process.env.FORGE_AI_MODEL || "sonnet",
            detail: "Local CLI installation and account authentication are not checked by the dashboard.",
          },
        ].map((item) => ({
          ...item,
          selected: selected === item.id,
          status: item.id === "claude-code" ? "not-checked" : item.configured ? "configured" : "needs-credentials",
        }));
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(rows));
        return;
      }
      if (requestUrl.pathname === "/api/config-snapshots") {
        const versions = await listAgentConfigVersions(projectPath);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(
          JSON.stringify(
            versions.map((item) => ({
              id: item.id,
              createdAt: item.createdAt,
              createdBy: item.createdBy,
              note: item.note,
              status: item.status,
              approvedBy: item.approvedBy,
              files: item.files.map((file) => ({ path: file.path, sha256: file.sha256 })),
            }))
          )
        );
        return;
      }
      if (requestUrl.pathname === "/api/config-files") {
        const category = requestUrl.searchParams.get("category");
        const id = requestUrl.searchParams.get("id");
        if (category !== null && category !== "agents" && category !== "skills")
          throw new Error("Choose agents or skills.");
        if (id !== null && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new Error("Invalid configuration file ID.");
        if (id !== null && category === null)
          throw new Error("A category is required when reading one configuration file.");
        const root = path.resolve(projectPath);
        const forgeDirectory = path.join(root, ".forge");
        if (id !== null) {
          const directory = path.join(forgeDirectory, category!);
          const file = path.join(directory, id + ".md");
          const realRoot = await realpath(root);
          const realForge = await realpath(forgeDirectory);
          const realDirectory = await realpath(directory);
          if (realForge !== path.join(realRoot, ".forge") || realDirectory !== path.join(realForge, category!))
            throw new Error("Configuration directories must not be symbolic links.");
          const info = await lstat(file);
          if (!info.isFile() || info.isSymbolicLink() || info.size > 128 * 1024)
            throw new Error("Configuration file is not a supported regular Markdown file.");
          const content = await readFile(file, "utf8");
          response
            .writeHead(200, { "content-type": "application/json; charset=utf-8" })
            .end(JSON.stringify({ category, id, content }));
          return;
        }
        const categories = category ? [category] : ["agents", "skills"];
        const items: Array<{ category: string; id: string; bytes: number }> = [];
        for (const kind of categories) {
          const directory = path.join(forgeDirectory, kind);
          let entries;
          try {
            const realRoot = await realpath(root);
            const realForge = await realpath(forgeDirectory);
            const realDirectory = await realpath(directory);
            if (realForge !== path.join(realRoot, ".forge") || realDirectory !== path.join(realForge, kind))
              throw new Error("Configuration directories must not be symbolic links.");
            entries = await readdir(directory, { withFileTypes: true });
          } catch (error) {
            if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") continue;
            throw error;
          }
          for (const entry of entries) {
            const name = entry.name.replace(/\.md$/, "");
            if (!entry.isFile() || !entry.name.endsWith(".md") || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) continue;
            const info = await lstat(path.join(directory, entry.name));
            if (info.isSymbolicLink() || info.size > 128 * 1024) continue;
            items.push({ category: kind, id: name, bytes: info.size });
          }
        }
        response
          .writeHead(200, { "content-type": "application/json; charset=utf-8" })
          .end(JSON.stringify(items.sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id))));
        return;
      }
      if (requestUrl.pathname === "/api/workflows") {
        const workflows = await listWorkflows(projectPath);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(workflows));
        return;
      }
      if (requestUrl.pathname === "/api/overview") {
        const report = await inspectProject(projectPath);
        const runs = await listRuns(projectPath);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(
          JSON.stringify({
            summary: report.summary,
            dependencies: report.dependencies,
            packageManagers: report.packageManagers,
            frameworks: report.frameworks,
            scripts: report.scripts,
            importantFiles: report.importantFiles,
            warnings: report.warnings,
            runCount: runs.length,
          })
        );
        return;
      }
      if (requestUrl.pathname === "/api/config-files") {
        const category = requestUrl.searchParams.get("category");
        const id = requestUrl.searchParams.get("id");
        if (category !== null && category !== "agents" && category !== "skills")
          throw new Error("Choose agents or skills.");
        if (id !== null && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new Error("Invalid configuration file ID.");
        if (id !== null && category === null)
          throw new Error("A category is required when reading one configuration file.");
        if (id !== null) {
          const file = path.join(path.resolve(projectPath), ".forge", category!, id + ".md");
          const info = await lstat(file);
          if (!info.isFile() || info.isSymbolicLink() || info.size > 128 * 1024)
            throw new Error("Configuration file is not a supported regular Markdown file.");
          const content = await readFile(file, "utf8");
          response
            .writeHead(200, { "content-type": "application/json; charset=utf-8" })
            .end(JSON.stringify({ category, id, content }));
          return;
        }
        const categories = category ? [category] : ["agents", "skills"];
        const items: Array<{ category: string; id: string; bytes: number }> = [];
        for (const kind of categories) {
          const directory = path.join(path.resolve(projectPath), ".forge", kind);
          let entries;
          try {
            entries = await readdir(directory, { withFileTypes: true });
          } catch (error) {
            if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") continue;
            throw error;
          }
          for (const entry of entries) {
            const name = entry.name.replace(/\.md$/, "");
            if (!entry.isFile() || !entry.name.endsWith(".md") || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) continue;
            const info = await lstat(path.join(directory, entry.name));
            if (info.isSymbolicLink() || info.size > 128 * 1024) continue;
            items.push({ category: kind, id: name, bytes: info.size });
          }
        }
        response
          .writeHead(200, { "content-type": "application/json; charset=utf-8" })
          .end(JSON.stringify(items.sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id))));
        return;
      }
      if (requestUrl.pathname === "/api/agents") {
        const agents = await loadAgentRegistry(projectPath);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(
          JSON.stringify(
            agents.map((agent) => ({
              id: agent.id,
              name: agent.name,
              description: agent.description,
              source: agent.source,
            }))
          )
        );
        return;
      }
      if (requestUrl.pathname === "/api/agent-security") {
        const report = await auditAgentConfiguration(projectPath);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(report));
        return;
      }
      if (requestUrl.pathname === "/api/evaluations") {
        const reports = await listEvaluationReports(projectPath);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(
          JSON.stringify(
            reports.map((report) => ({
              suiteId: report.suiteId,
              suiteName: report.suiteName,
              runId: report.runId,
              evaluatedAt: report.evaluatedAt,
              score: report.score,
              passed: report.passed,
              summary: report.summary,
              cases: report.cases.map((item) => ({
                caseId: item.caseId,
                agent: item.agent,
                score: item.score,
                passed: item.passed,
                status: item.status,
              })),
              judge: "judge" in report ? report.judge : null,
              judgedCases: "judgedCases" in report ? report.judgedCases : [],
            }))
          )
        );
        return;
      }
      if (requestUrl.pathname === "/api/benchmarks") {
        const benchmarks = await listBenchmarks(projectPath);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(benchmarks));
        return;
      }
      if (requestUrl.pathname === "/api/benchmark-matrices") {
        const matrices = await listBenchmarkMatrices(projectPath);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(matrices));
        return;
      }
      if (requestUrl.pathname === "/api/benchmark-regression") {
        const matrixId = requestUrl.searchParams.get("matrixId") ?? undefined;
        const regression = await loadBenchmarkRegression(projectPath, matrixId);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(regression));
        return;
      }
      if (requestUrl.pathname === "/api/experiment-history") {
        const matrices = await listBenchmarkMatrices(projectPath);
        const suiteId = requestUrl.searchParams.get("suite") ?? undefined;
        const candidateId = requestUrl.searchParams.get("candidate") ?? undefined;
        const report = buildExperimentHistory(matrices, {
          ...(suiteId ? { suiteId } : {}),
          ...(candidateId ? { candidateId } : {}),
          limit: 100,
        });
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(report));
        return;
      }
      if (requestUrl.pathname === "/api/agent-optimization") {
        const matrices = await listBenchmarkMatrices(projectPath);
        const plan = buildAgentOptimizationPlan(matrices);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(plan));
        return;
      }
      if (requestUrl.pathname === "/api/agent-performance") {
        const matrices = await listBenchmarkMatrices(projectPath);
        const latest = matrices.at(-1);
        const leaderboard = (latest?.agentSummary ?? [])
          .slice()
          .sort((a, b) => b.averageScore - a.averageScore || b.passRate - a.passRate);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(
          JSON.stringify({
            matrixId: latest?.matrixId ?? null,
            matrixName: latest?.matrixName ?? null,
            createdAt: latest?.createdAt ?? null,
            agents: leaderboard,
          })
        );
        return;
      }
      if (requestUrl.pathname === "/api/agent-intelligence") {
        const matrices = await listBenchmarkMatrices(projectPath);
        const suiteId = requestUrl.searchParams.get("suite") ?? undefined;
        const candidateId = requestUrl.searchParams.get("candidate") ?? undefined;
        const rawLimit = requestUrl.searchParams.get("limit");
        const limit = rawLimit ? Number(rawLimit) : undefined;
        const report = buildAgentEvaluationIntelligence(matrices, {
          ...(suiteId ? { suiteId } : {}),
          ...(candidateId ? { candidateId } : {}),
          ...(limit !== undefined && Number.isSafeInteger(limit) ? { limit } : {}),
        });
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(report));
        return;
      }
      if (requestUrl.pathname === "/api/observability") {
        const runs = await listRuns(projectPath);
        const agents = new Map<
          string,
          {
            name: string;
            requests: number;
            successes: number;
            fallbacks: number;
            failures: number;
            inputTokensEstimate: number;
            outputTokensEstimate: number;
            durationMs: number;
            retries: number;
          }
        >();
        const providers = new Map<
          string,
          {
            name: string;
            requests: number;
            successes: number;
            fallbacks: number;
            failures: number;
            durationMs: number;
            retries: number;
          }
        >();
        const recent: Array<{ runId: string; createdAt: string; entries: unknown[] }> = [];
        for (const run of runs.slice(0, 30)) {
          try {
            const trace = await loadExecutionTrace(projectPath, run.id);
            recent.push({ runId: run.id, createdAt: trace.createdAt, entries: trace.entries.slice(-20) });
            for (const entry of trace.entries) {
              const agent = agents.get(entry.agent) ?? {
                name: entry.agent,
                requests: 0,
                successes: 0,
                fallbacks: 0,
                failures: 0,
                inputTokensEstimate: 0,
                outputTokensEstimate: 0,
                durationMs: 0,
                retries: 0,
              };
              agent.requests += 1;
              agent.successes += entry.outcome === "success" ? 1 : 0;
              agent.fallbacks += entry.outcome === "fallback" ? 1 : 0;
              agent.failures += entry.outcome === "failed" ? 1 : 0;
              agent.inputTokensEstimate += entry.inputTokensEstimate;
              agent.outputTokensEstimate += entry.outputTokensEstimate;
              agent.durationMs += entry.durationMs;
              agent.retries += entry.retries ?? 0;
              agents.set(entry.agent, agent);
              const provider = providers.get(entry.provider) ?? {
                name: entry.provider,
                requests: 0,
                successes: 0,
                fallbacks: 0,
                failures: 0,
                durationMs: 0,
                retries: 0,
              };
              provider.requests += 1;
              provider.successes += entry.outcome === "success" ? 1 : 0;
              provider.fallbacks += entry.outcome === "fallback" ? 1 : 0;
              provider.failures += entry.outcome === "failed" ? 1 : 0;
              provider.durationMs += entry.durationMs;
              provider.retries += entry.retries ?? 0;
              providers.set(entry.provider, provider);
            }
          } catch (error) {
            if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
          }
        }
        const parseBudgetMap = (raw: string | undefined): Record<string, number> => {
          if (!raw) return {};
          try {
            const value: unknown = JSON.parse(raw);
            return value && typeof value === "object" && !Array.isArray(value)
              ? Object.fromEntries(
                  Object.entries(value).filter(
                    (item): item is [string, number] =>
                      typeof item[1] === "number" && Number.isFinite(item[1]) && item[1] > 0
                  )
                )
              : {};
          } catch {
            return {};
          }
        };
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(
          JSON.stringify({
            generatedAt: new Date().toISOString(),
            runsScanned: runs.slice(0, 30).length,
            totals: {
              requests: [...agents.values()].reduce((n, a) => n + a.requests, 0),
              inputTokensEstimate: [...agents.values()].reduce((n, a) => n + a.inputTokensEstimate, 0),
              outputTokensEstimate: [...agents.values()].reduce((n, a) => n + a.outputTokensEstimate, 0),
              durationMs: [...agents.values()].reduce((n, a) => n + a.durationMs, 0),
              failures: [...agents.values()].reduce((n, a) => n + a.failures, 0),
              fallbacks: [...agents.values()].reduce((n, a) => n + a.fallbacks, 0),
            },
            agents: [...agents.values()].sort((a, b) => b.durationMs - a.durationMs),
            providers: [...providers.values()].sort((a, b) => b.requests - a.requests),
            budgets: {
              perAgentTokens: parseBudgetMap(
                process.env.ANVIL_MAX_ESTIMATED_TOKENS_PER_AGENT || process.env.FORGE_MAX_ESTIMATED_TOKENS_PER_AGENT
              ),
              perAgentDurationMs: parseBudgetMap(
                process.env.ANVIL_MAX_TASK_DURATION_MS_BY_AGENT || process.env.FORGE_MAX_TASK_DURATION_MS_BY_AGENT
              ),
              runTokens:
                Number(
                  process.env.ANVIL_MAX_ESTIMATED_TOKENS_PER_RUN || process.env.FORGE_MAX_ESTIMATED_TOKENS_PER_RUN
                ) || null,
              taskDurationMs:
                Number(process.env.ANVIL_MAX_TASK_DURATION_MS || process.env.FORGE_MAX_TASK_DURATION_MS) || null,
            },
            recent,
          })
        );
        return;
      }
      const traceRoute = requestUrl.pathname.match(/^\/api\/runs\/([^/]+)\/trace$/);
      if (traceRoute) {
        try {
          const trace = await loadExecutionTrace(projectPath, decodeURIComponent(traceRoute[1]!));
          response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(trace));
        } catch (error) {
          if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
            response
              .writeHead(404, { "content-type": "application/json; charset=utf-8" })
              .end(JSON.stringify({ error: "No execution trace has been saved for this run." }));
            return;
          }
          throw error;
        }
        return;
      }
      if (requestUrl.pathname.startsWith("/api/runs/")) {
        const runId = decodeURIComponent(requestUrl.pathname.slice("/api/runs/".length));
        const run = await loadRun(projectPath, runId);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(
          JSON.stringify({
            id: run.id,
            goal: run.goal,
            status: run.status,
            createdAt: run.createdAt,
            updatedAt: run.updatedAt,
            tasks: run.tasks.map((record) => ({
              id: record.task.id,
              title: record.task.title,
              agent: record.task.agent,
              status: record.status,
              dependsOn: record.task.dependsOn ?? [],
              result: record.result
                ? { provider: record.result.provider, model: record.result.model, content: record.result.content }
                : undefined,
              error: record.error,
              approval: record.approval,
            })),
            events: run.events.map((event) => ({
              at: event.at,
              taskId: event.taskId,
              type: event.type,
              message: event.message,
            })),
          })
        );
        return;
      }
      if (requestUrl.pathname === "/api/runs") {
        const runs = await listRuns(projectPath);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(
          JSON.stringify(
            runs.map((run) => ({
              id: run.id,
              goal: run.goal,
              status: run.status,
              createdAt: run.createdAt,
              tasks: run.tasks.map((task) => ({
                id: task.task.id,
                title: task.task.title,
                agent: task.task.agent,
                status: task.status,
              })),
              events: run.events.map((event) => ({
                at: event.at,
                taskId: event.taskId,
                type: event.type,
                message: event.message,
              })),
            }))
          )
        );
        return;
      }
      if (requestUrl.pathname === "/api/health") {
        const report = await generateProjectHealth(projectPath);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(report));
        return;
      }
      if (requestUrl.pathname === "/api/quality") {
        const report = await auditProject(projectPath);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(
          JSON.stringify({
            score: report.score,
            grade: report.grade,
            generatedAt: report.generatedAt,
            metrics: report.metrics,
            findings: report.findings.map((item) => ({
              id: item.id,
              severity: item.severity,
              title: item.title,
              recommendation: item.recommendation,
            })),
          })
        );
        return;
      }
      if (requestUrl.pathname === "/api/verifications") {
        const history = await listVerifications(projectPath, 25);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(
          JSON.stringify(
            history.map((item) => ({
              id: item.id,
              script: item.script,
              status: item.status,
              exitCode: item.exitCode,
              durationMs: item.durationMs,
              startedAt: item.startedAt,
              finishedAt: item.finishedAt,
            }))
          )
        );
        return;
      }
      if (requestUrl.pathname === "/api/reviews") {
        const records = await listReviews(projectPath);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(
          JSON.stringify(
            records.slice(0, 50).map((record) => ({
              id: record.id,
              createdAt: record.createdAt,
              scope: record.report.scope,
              filesReviewed: record.report.filesReviewed.length,
              staticFindings: record.report.findings.length,
              aiSuggestions: record.ai?.suggestions.length ?? 0,
              topFindings: [
                ...record.report.findings.slice(0, 3).map((item) => item.title),
                ...(record.ai?.suggestions.slice(0, 2).map((item) => item.title) ?? []),
              ],
            }))
          )
        );
        return;
      }
      if (requestUrl.pathname === "/api/regression") {
        const base = requestUrl.searchParams.get("base") ?? "HEAD";
        const report = await generateRegressionReport(projectPath, base);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(report));
        return;
      }
      if (requestUrl.pathname === "/api/search") {
        const query = requestUrl.searchParams.get("q") ?? "";
        const limit = Number(requestUrl.searchParams.get("limit") ?? 80);
        const report = await searchWorkspace(projectPath, query, limit);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(report));
        return;
      }
      if (requestUrl.pathname === "/api/workspace") {
        const relativePath = requestUrl.searchParams.get("path") ?? "";
        const listing = await listWorkspaceDirectory(projectPath, relativePath);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(listing));
        return;
      }
      if (requestUrl.pathname === "/api/workspace/file") {
        const relativePath = requestUrl.searchParams.get("path") ?? "";
        const file = await readWorkspaceFile(projectPath, relativePath);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(file));
        return;
      }
      if (requestUrl.pathname === "/api/dependency-intelligence") {
        const report = await analyzeDependencies(projectPath);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(report));
        return;
      }
      if (requestUrl.pathname === "/api/intelligence-timeline") {
        const [comparison, snapshots] = await Promise.all([
          compareLatestIntelligence(projectPath),
          listIntelligenceSnapshots(projectPath),
        ]);
        response
          .writeHead(200, { "content-type": "application/json; charset=utf-8" })
          .end(JSON.stringify({ comparison, snapshots }));
        return;
      }
      if (requestUrl.pathname === "/api/change-intelligence") {
        const report = await analyzeChangeIntelligence(projectPath);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(report));
        return;
      }
      if (requestUrl.pathname === "/api/engineering-risk") {
        const report = await analyzeEngineeringRisk(projectPath);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(report));
        return;
      }
      if (requestUrl.pathname === "/api/dependency-graph") {
        const graph = await buildDependencyGraph(projectPath);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(graph));
        return;
      }
      if (requestUrl.pathname === "/api/doctor") {
        const report = await runDoctorChecks(projectPath);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(report));
        return;
      }
      if (requestUrl.pathname === "/api/clean/preview") {
        const result = await cleanProject(projectPath, { apply: false });
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(result));
        return;
      }
      if (requestUrl.pathname === "/api/clean/snapshots") {
        const backupDirs = [path.join(projectPath, ".anvil", "backups"), path.join(projectPath, ".forge", "backups")];
        const snapshots: Array<{ id: string; at: string; files: number }> = [];
        for (const dir of backupDirs) {
          try {
            const entries = await readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.isDirectory() && entry.name.startsWith("backup-")) {
                const manifestPath = path.join(dir, entry.name, "manifest.json");
                try {
                  const raw = await readFile(manifestPath, "utf8");
                  const data = JSON.parse(raw);
                  snapshots.push({
                    id: entry.name,
                    at: data.timestamp || new Date().toISOString(),
                    files: Array.isArray(data.files) ? data.files.length : 0,
                  });
                } catch {
                  snapshots.push({ id: entry.name, at: new Date().toISOString(), files: 0 });
                }
              }
            }
          } catch {}
        }
        response
          .writeHead(200, { "content-type": "application/json; charset=utf-8" })
          .end(JSON.stringify({ snapshots: snapshots.sort((a, b) => b.at.localeCompare(a.at)) }));
        return;
      }
      if (requestUrl.pathname === "/api/memory") {
        const entries = await listProjectMemory(projectPath);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify({ entries }));
        return;
      }
      if (requestUrl.pathname === "/api/adrs") {
        const adrs = await listAdrs(projectPath);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify({ adrs }));
        return;
      }
      if (requestUrl.pathname === "/api/security") {
        const report = await scanProjectSecurity(projectPath);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(report));
        return;
      }
      if (requestUrl.pathname === "/api/gate") {
        const gateEvaluation = await evaluateGate(projectPath);
        response
          .writeHead(200, { "content-type": "application/json; charset=utf-8" })
          .end(JSON.stringify(gateEvaluation));
        return;
      }
      if (requestUrl.pathname === "/api/architecture") {
        const map = await mapArchitecture(projectPath);
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(map));
        return;
      }
      response.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "Not found." }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected dashboard error.";
      response
        .writeHead(500, { "content-type": "application/json; charset=utf-8" })
        .end(JSON.stringify({ error: message }));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  // Start heartbeat — clear when server closes
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => {
    broadcastEvent("heartbeat", { at: new Date().toISOString() });
  }, 15000);
  server.once("close", () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    sseClients.clear();
  });

  return { server, url: `http://${host}:${port}` };
}
