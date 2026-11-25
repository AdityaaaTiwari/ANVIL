export const DASHBOARD_STYLES = String.raw`
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
`;
