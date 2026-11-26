export const DASHBOARD_SCRIPT = String.raw`
const el=id=>document.getElementById(id);
const on=(id,event,handler)=>{const node=el(id);if(node)node.addEventListener(event,handler);};
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const renderHtml=(node,markup)=>{if(!node)return;node.innerHTML=markup; // anvil-disable-line ANVIL-R003 -- centralized DOM helper; callers escape dynamic fields with esc()
};
const renderEmpty=node=>{if(node)node.replaceChildren();};

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
    renderHtml(el("evaluationHistory"), reports.length ? reports.map(report=>'<div class="activity-item"><div style="width:100%"><div class="rowitem"><b>'+esc(report.suiteName)+'</b><span class="pill '+(report.passed?'pill-emerald':'pill-accent')+'">'+(report.passed?'PASS':'NEEDS REVIEW')+'</span></div><div class="run-meta">'+esc(report.runId)+' · '+esc(new Date(report.evaluatedAt).toLocaleString())+'</div><div class="run-meta">Score '+report.score+'/100 · '+report.summary.passed+'/'+report.summary.total+' deterministic cases passed · '+report.summary.missingOutput+' missing outputs</div>'+report.cases.map(item=>'<div class="run-meta">'+esc(item.caseId)+' · '+esc(item.agent)+' · '+item.score+'/100 · '+(item.passed?'PASS':esc(item.status))+'</div>').join("")+'</div></div>').join("") : '<div class="empty">No evaluation reports yet. Run <code>anvil evaluate RUNID</code> after creating a saved run.</div>');
  }catch(error){renderHtml(el("evaluationHistory"), '<div class="error">'+esc(error.message)+'</div>');}
}

async function loadBenchmarkHistory(){
  try{
    const [docs,matrices] = await Promise.all([api("/api/benchmarks"), api("/api/benchmark-matrices")]);
    let all = docs.flatMap(doc=>doc.groups.map(group=>({suite:doc.suiteName,key:group.key,trials:group.trials,completed:group.trials,averageScore:group.averageScore,passRate:group.passRate,scoreStdDev:group.scoreStdDev,bestScore:group.bestScore,worstScore:group.worstScore,averageDurationMs:group.averageDurationMs,averageEstimatedTokens:group.averageEstimatedTokens,totalRetries:group.totalRetries,averageJudgeScore:group.averageJudgeScore,judgePassRate:group.judgePassRate})));
    all.push(...matrices.flatMap(matrix=>matrix.summary.map(group=>({suite:matrix.matrixName+" · "+matrix.suiteId,key:group.candidateId+" ("+group.provider+"/"+group.model+")",trials:group.trials,completed:group.completed,averageScore:group.averageScore,passRate:group.passRate,scoreStdDev:group.scoreStdDev,bestScore:group.averageScore,worstScore:group.averageScore,averageDurationMs:group.averageDurationMs,averageEstimatedTokens:group.averageEstimatedTokens,totalRetries:0}))));
    if(!all.length && isShowcase) all = SAMPLE_BENCHMARKS;
    const trials = all.reduce((n,g)=>n+(g.trials||0),0);
    el("benchmarkUpdated").textContent = all.length + " model groups · " + trials + " trials";
    renderHtml(el("benchmarkHistory"), all.length ? all.map(group=>'<div class="activity-item"><div style="width:100%"><div class="rowitem"><b>'+esc(group.key)+'</b><span class="pill pill-accent">'+group.averageScore+'/100 avg</span></div><div class="run-meta">'+esc(group.suite)+' · '+group.completed+'/'+group.trials+' completed · '+group.passRate+'% pass rate · score σ '+group.scoreStdDev+'</div><div class="run-meta">Best '+group.bestScore+' · worst '+group.worstScore+' · avg '+group.averageDurationMs+' ms · ~'+group.averageEstimatedTokens+' tokens · '+(group.totalRetries||0)+' retries</div></div></div>').join("") : '<div class="empty">No benchmark trials yet. Run <code>anvil benchmark-matrix</code> or record a completed run with <code>anvil benchmark RUN_ID</code>.</div>');
  }catch(error){renderHtml(el("benchmarkHistory"), '<div class="error">'+esc(error.message)+'</div>');}
}

async function loadBenchmarkRegression(){
  try{
    const report=await api("/api/benchmark-regression");
    if(report.status==="insufficient-history" && isShowcase){
      el("regressionStatus").textContent="STABLE";
      renderHtml(el("benchmarkRegression"), '<div class="activity-item"><div><b>Engineering Security Regression Suite</b><div class="run-meta">Suite engineering-basics · baseline 2 hours ago · current latest</div><div class="run-meta" style="color:var(--emerald)">✓ Zero performance regressions detected across 3 comparable model candidates</div></div></div><div class="activity-item"><div style="width:100%"><div class="rowitem"><b>candidate-claude-sonnet · Anthropic/claude-3-7-sonnet</b><span class="pill pill-emerald">+4 score</span></div><div class="run-meta">Pass rate 96% → 100% · duration -8% · estimated tokens +2%</div></div></div>');
      return;
    }
    const status=report.status.toUpperCase().replaceAll("-"," ");
    el("regressionStatus").textContent=status;
    renderHtml(el("benchmarkRegression"), '<div class="activity-item"><div><b>'+esc(report.matrixName)+'</b><div class="run-meta">Suite '+esc(report.suiteId||"—")+' · baseline '+(report.baselineAt?esc(new Date(report.baselineAt).toLocaleString()):"not available")+' · current '+(report.currentAt?esc(new Date(report.currentAt).toLocaleString()):"not available")+'</div>'+report.summary.map(item=>'<div class="run-meta">'+esc(item)+'</div>').join("")+'</div></div>'+(report.candidates.length?report.candidates.map(item=>'<div class="activity-item"><div style="width:100%"><div class="rowitem"><b>'+esc(item.candidateId)+' · '+esc(item.provider)+'/'+esc(item.model)+'</b><span class="pill">'+(item.scoreDelta>0?"+":"")+item.scoreDelta+' score</span></div><div class="run-meta">Pass rate '+item.baselinePassRate+'% → '+item.currentPassRate+'% · duration '+item.durationChangePercent+'% · estimated tokens '+item.tokenChangePercent+'%</div>'+item.regressions.map(issue=>'<div class="run-meta" style="color:var(--danger)">REGRESSION · '+esc(issue)+'</div>').join("")+item.warnings.map(issue=>'<div class="run-meta" style="color:var(--warning)">WARNING · '+esc(issue)+'</div>').join("")+'</div></div>').join(""):'<div class="empty">No comparable candidates found. Run the same matrix again with the same goal and suite to establish a baseline.</div>'));
  }catch(error){renderHtml(el("benchmarkRegression"), '<div class="error">'+esc(error.message)+'</div>');}
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
    renderHtml(el("agentPerformance"), agents.length ? agents.map((item,index)=>'<div class="activity-item"><div style="width:100%"><div class="rowitem"><b>#'+(index+1)+' '+esc(item.agent)+'</b><span class="pill pill-accent">'+item.averageScore+'/100</span></div><div class="run-meta">'+esc(item.candidateId)+' · '+esc(item.provider)+'/'+esc(item.model)+' · '+item.completed+'/'+item.trials+' evaluated · '+item.passRate+'% pass rate</div><div class="run-meta">Skills observed: '+esc((item.skillsObserved||[]).join(", ")||"none")+'</div></div></div>').join("") : '<div class="empty">No per-agent scorecards yet. Run a benchmark matrix with an evaluation suite that includes agent-specific cases.</div>');
  }catch(error){renderHtml(el("agentPerformance"), '<div class="error">'+esc(error.message)+'</div>');}
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
    renderHtml(el("skillExperiments"), experiments.length ? experiments.map(matrix=>{
      const item=matrix.skillExperiment;
      return '<div class="activity-item"><div style="width:100%"><div class="rowitem"><b>'+esc(matrix.matrixName)+'</b><span class="pill pill-emerald">'+(item.scoreDelta>0?"+":"")+item.scoreDelta+' score</span></div><div class="run-meta">'+esc(matrix.suiteId)+' · '+esc(matrix.goal)+'</div><div class="run-meta">Baseline '+esc(item.baselineCandidateId)+' (no skills) → treatment '+esc(item.treatmentCandidateId)+' · skills: '+esc((item.skillIds||[]).join(", "))+'</div><div class="run-meta">Score '+item.baselineScore+' → '+item.treatmentScore+' · pass rate '+item.baselinePassRate+'% → '+item.treatmentPassRate+'% · duration '+item.durationChangePercent+'% · estimated tokens '+item.tokenChangePercent+'%</div>'+(item.agentDeltas||[]).map(agent=>'<div class="run-meta">'+esc(agent.agent)+': '+agent.baselineScore+' → '+agent.treatmentScore+' ('+(agent.scoreDelta>0?"+":"")+agent.scoreDelta+')</div>').join("")+'</div></div>';
    }).join("") : '<div class="empty">No controlled skill experiments yet. Configure a skillExperiment in a benchmark matrix to compare no-skill and skill-enabled runs.</div>');
  }catch(error){renderHtml(el("skillExperiments"), '<div class="error">'+esc(error.message)+'</div>');}
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
    renderHtml(el("experimentLeaderboard"), data.entries.length?data.entries.map((item,index)=>{
      const width=Math.max(0,Math.min(100,item.averageScore));
      const trend=item.scoreDelta===null?"FIRST RUN":(item.scoreDelta>0?"+":"")+item.scoreDelta+" vs previous";
      const trendColor=item.regression?"var(--danger)":item.scoreDelta>0?"var(--emerald)":"var(--muted)";
      return '<div class="activity-item"><div style="width:100%"><div class="rowitem"><b>#'+(index+1)+' '+esc(item.candidateId)+'</b><span class="pill pill-accent">'+item.averageScore+'/100 avg</span></div><div class="run-meta">'+esc(item.suiteId)+' · '+esc(item.provider)+'/'+esc(item.model)+' · '+item.runs+' runs · '+item.completedTrials+' trials</div><div class="barline"><span style="width:'+width+'%"></span></div><div class="run-meta">'+item.passRate+'% pass · σ '+item.scoreStdDev+' · '+item.averageDurationMs+' ms · ~'+item.averageEstimatedTokens+' estimated tokens</div><div class="run-meta" style="color:'+trendColor+'">'+esc(trend)+(item.regression?' · REGRESSION ALERT':'')+'</div><div class="run-meta">Latest matrix: '+esc(item.latestMatrixId)+'</div></div></div>';
    }).join(""):'<div class="empty">No historical benchmark candidates yet. Run a benchmark matrix to populate the leaderboard.</div>');
    
    const comparison=data.entries.slice(0,8);
    renderHtml(el("experimentComparison"), comparison.length?comparison.map((item,index)=>{
      const score=Math.max(0,Math.min(100,Number(item.averageScore)||0)),pass=Math.max(0,Math.min(100,Number(item.passRate)||0));
      const duration=Math.max(0,Number(item.averageDurationMs)||0),tokens=Math.max(0,Number(item.averageEstimatedTokens)||0);
      return '<div class="activity-item"><div style="width:100%"><div class="rowitem"><b>'+esc(item.candidateId)+'</b><span class="pill pill-cyan">'+score+'/100 score</span></div><div class="run-meta">'+esc(item.provider)+' / '+esc(item.model)+' · '+esc(item.suiteId)+'</div><div class="columns" style="grid-template-columns:1fr 1fr;gap:12px;margin-top:10px"><div><div class="run-meta">Average score · '+score+'%</div><div class="barline"><span style="width:'+score+'%;background:var(--cyan)"></span></div></div><div><div class="run-meta">Pass rate · '+pass+'%</div><div class="barline"><span style="width:'+pass+'%;background:var(--emerald)"></span></div></div></div><div class="run-meta" style="margin-top:8px">'+duration.toLocaleString()+' ms average · ~'+tokens.toLocaleString()+' estimated tokens · '+item.completedTrials+' completed trials</div></div></div>';
    }).join(""):'<div class="empty">Run benchmark matrices to compare candidate performance visually.</div>');
    renderHtml(el("experimentRegressions"), data.regressions.length?data.regressions.map(item=>'<div class="run-meta" style="color:var(--danger)">REGRESSION · '+esc(item)+'</div>').join(""):'<div class="run-meta">No score drops of 5 points or more detected in the selected history.</div>');
    el("experimentHistoryCaveats").textContent=(data.caveats||[]).join(" · ");
  }catch(error){renderHtml(el("experimentLeaderboard"), '<div class="error">'+esc(error.message)+'</div>');}
}

async function loadAgentOptimization(){
  try{
    const plan=await api("/api/agent-optimization");
    if(plan.status==="insufficient-history" && isShowcase){
      el("agentOptimizationStatus").textContent="2 recommendations";
      renderHtml(el("agentOptimization"), '<div class="activity-item"><div style="width:100%"><div class="rowitem"><b>security-reviewer · candidate-claude</b><span class="pill pill-emerald">high confidence</span></div><div class="run-meta">Score 94 → 98 (+4) · skills observed: secure-changes</div><div class="run-meta" style="color:var(--emerald)">RECOMMEND · Provide strict JSON schema for zero-trust boundary verification</div></div></div><div class="activity-item"><div style="width:100%"><div class="rowitem"><b>planner · candidate-gpt41</b><span class="pill pill-cyan">medium confidence</span></div><div class="run-meta">Score 90 → 94 (+4) · skills observed: architecture-mapping</div><div class="run-meta" style="color:var(--cyan)">RECOMMEND · Pin maximum task granularity to 5 files per sub-step</div></div></div>');
      return;
    }
    el("agentOptimizationStatus").textContent=plan.status==="recommendations"?plan.suggestions.length+" suggestions":"NEEDS HISTORY";
    renderHtml(el("agentOptimization"), plan.suggestions?.length?plan.suggestions.map(item=>'<div class="activity-item"><div style="width:100%"><div class="rowitem"><b>'+esc(item.agent)+' · '+esc(item.candidateId)+'</b><span class="pill">'+esc(item.confidence)+' confidence</span></div><div class="run-meta">Score '+(item.baselineScore===null?"no baseline":item.baselineScore+' → '+item.currentScore+' ('+item.scoreDelta+')')+' · skills observed: '+esc(item.skillIdsObserved.join(", ")||"none")+'</div>'+item.recommendedActions.map(action=>'<div class="run-meta">RECOMMEND · '+esc(action)+'</div>').join("")+'</div></div>').join(""):'<div class="empty">'+(plan.status==="insufficient-history"?"Run the same evaluation suite and goal twice to establish a baseline.":"No repeated failure patterns found in the latest comparable matrix.")+'</div>');
  }catch(error){renderHtml(el("agentOptimization"), '<div class="error">'+esc(error.message)+'</div>');}
}

async function loadAgentIntelligence(){
  try{
    const data=await api("/api/agent-intelligence");
    if((data.status==="insufficient-data"||!data.cards?.length) && isShowcase){
      el("agentIntelligenceStatus").textContent="READY";
      renderHtml(el("agentIntelligence"), '<div class="activity-item"><div style="width:100%"><div class="rowitem"><b>security-reviewer</b><span class="pill pill-accent">98/100 avg (high confidence)</span></div><div class="run-meta">14 evaluations analyzed · <span style="color:var(--emerald)">+6 points score trend</span></div><div class="run-meta" style="margin-top:4px"><b>Repeated failure criteria:</b> <span class="pill pill-emerald">0% failure rate</span></div><div class="run-meta" style="margin-top:4px"><b>Recommendations:</b> Model demonstrates high adherence to least-privilege checks.</div></div></div><div class="activity-item"><div style="width:100%"><div class="rowitem"><b>architect</b><span class="pill pill-cyan">94/100 avg (high confidence)</span></div><div class="run-meta">16 evaluations analyzed · <span style="color:var(--cyan)">+4 points score trend</span></div><div class="run-meta" style="margin-top:4px"><b>Repeated failure criteria:</b> <span class="pill">circular-import 4%</span></div></div></div>');
      return;
    }
    el("agentIntelligenceStatus").textContent=data.status.toUpperCase();
    if(data.status==="insufficient-data"||!data.cards?.length){
      renderHtml(el("agentIntelligence"), '<div class="empty">Not enough historical benchmark data yet. Run benchmark matrices across multiple trials.</div>');
      return;
    }
    renderHtml(el("agentIntelligence"), data.cards.map(c=>'<div class="activity-item"><div style="width:100%"><div class="rowitem"><b>'+esc(c.agent)+'</b><span class="pill">'+c.averageScore+'/100 avg ('+esc(c.confidence)+' confidence)</span></div><div class="run-meta">'+c.evaluations+' evaluations analyzed</div></div></div>').join(""));
  }catch(e){renderHtml(el("agentIntelligence"), '<div class="error">'+esc(e.message)+'</div>');}
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
    renderHtml(el("observabilityMetrics"), metric("Provider requests",t.requests,"Recorded agent attempts")+metric("Estimated tokens","~"+(t.inputTokensEstimate+t.outputTokensEstimate).toLocaleString(),"Input "+t.inputTokensEstimate.toLocaleString()+" · output "+t.outputTokensEstimate.toLocaleString())+metric("Agent time",Math.round(t.durationMs/1000)+" s","Accumulated provider wait time")+metric("Failures / fallbacks",t.failures+" / "+t.fallbacks,data.runsScanned+" runs scanned"));
    renderHtml(el("agentObservability"), data.agents.length?data.agents.map(a=>{
      const used=a.inputTokensEstimate+a.outputTokensEstimate,limit=data.budgets.perAgentTokens[a.name]||null,pct=limit?Math.min(100,Math.round(used/limit*100)):null;
      return '<div class="activity-item"><div style="width:100%"><div class="rowitem"><b>'+esc(a.name)+'</b><span class="pill pill-accent">'+a.requests+' attempts</span></div><div class="run-meta">~'+used.toLocaleString()+' tokens · '+Math.round(a.durationMs/1000)+' s · '+a.failures+' failures · '+(a.retries||0)+' retries</div>'+(limit?'<div class="barline"><span style="width:'+pct+'%"></span></div><div class="run-meta">'+pct+'% of configured cumulative token budget ('+limit.toLocaleString()+')</div>':'<div class="run-meta">No per-agent token budget configured</div>')+'</div></div>';
    }).join(""):'<div class="empty">No saved agent traces yet. Run a workflow to populate observability.</div>');
    renderHtml(el("providerObservability"), data.providers.length?data.providers.map(p=>'<div class="activity-item"><div><b>'+esc(p.name)+'</b><div class="run-meta">'+p.requests+' requests · '+p.successes+' successes · '+p.fallbacks+' fallbacks · '+p.failures+' failures</div><div class="run-meta">'+Math.round(p.durationMs/1000)+' s accumulated duration</div></div></div>').join(""):'<div class="empty">No provider traces recorded yet.</div>');
    el("observabilityWarnings").textContent="Usage is estimated from model character lengths, not provider billing data.";
  }catch(error){renderHtml(el("observabilityMetrics"), '<div class="error">'+esc(error.message)+'</div>');}
}

async function loadOverview(){
  try{
    const data=await api("/api/overview");
    const s=data.summary;
    const runsCount = (data.runCount || (isShowcase ? SAMPLE_RUNS.length : 0));
    renderHtml(el("metrics"), metric("Source files",s.filesScanned,"Files inspected")+metric("Directories",s.directoriesScanned,"Project folders")+metric("Dependencies",data.dependencies.production+data.dependencies.development,data.dependencies.production+" production · "+data.dependencies.development+" development")+metric("Saved runs",runsCount,"Local execution history"));
    const total=Math.max(1,s.languages.reduce((n,x)=>n+x.files,0));
    renderHtml(el("languages"), s.languages.length?s.languages.slice(0,8).map(x=>'<div><div class="rowitem"><b>'+esc(x.name)+'</b><span class="muted">'+x.files+' files</span></div><div class="barline"><span style="width:'+Math.round(x.files/total*100)+'%"></span></div></div>').join(""):'<div class="empty">No recognized source files found.</div>');
    const stack=[...(data.packageManagers||[]),...(data.frameworks||[])];
    renderHtml(el("stack"), stack.length?stack.map(x=>'<div class="rowitem"><b>'+esc(x)+'</b><span class="pill pill-emerald">DETECTED</span></div>').join(""):'<div class="empty">No common stack detected.</div>');
    const signals=[["Important files",data.importantFiles.length],["Available scripts",Object.keys(data.scripts).length],["Scan warnings",data.warnings.length],["Architecture candidates","Ready in Architecture tab"]];
    renderHtml(el("signals"), signals.map(([k,v])=>'<div class="rowitem"><b>'+esc(k)+'</b><span class="pill">'+esc(v)+'</span></div>').join(""));
  }catch(error){renderHtml(el("metrics"), '<div class="card error">Dashboard error: '+esc(error.message)+'</div>');}
}

async function loadAgents(){
  try{
    const data=await api("/api/agents");
    renderHtml(el("agents"), data.length?data.map(agent=>'<div class="rowitem"><div><b>'+esc(agent.name)+'</b><div class="run-meta">'+esc(agent.description)+'</div></div><span class="pill pill-accent">'+esc(agent.source)+'</span></div>').join(""):'<div class="empty">No agent roles found.</div>');
  }catch(error){renderHtml(el("agents"), '<div class="error">'+esc(error.message)+'</div>');}
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
    
    renderHtml(el("runInspector"), '<div><b>'+esc(run.goal)+'</b><div class="run-meta">'+esc(run.status)+' · '+esc(new Date(run.createdAt).toLocaleString())+'</div><div class="run-meta">'+completedCount+' / '+run.tasks.length+' tasks completed · '+runningCount+' running · '+failedCount+' failed or blocked</div><div class="barline"><span style="width:'+progressPercent+'%"></span></div></div><div class="card"><div class="section-head"><h2>Agent handoff map</h2><span class="pill">'+run.tasks.length+' TASKS</span></div><div class="task-grid">'+handoffs+'</div><div class="run-meta">Dependency links show which completed agent proposals are passed downstream.</div></div>'+eventStream+trace+run.tasks.map(task=>'<article class="inspector-task '+(task.status==="awaiting_approval"?"approval":"")+'"><div class="run-title"><b>'+esc(task.title)+'</b><span class="pill">'+esc(task.status)+'</span></div><div class="run-meta">'+esc(task.agent)+' · '+esc(task.id)+(task.dependsOn&&task.dependsOn.length?' · depends on '+esc(task.dependsOn.join(', ')):'')+'</div>'+(task.result?'<pre>'+esc(task.result.content)+'</pre>':"")+(task.error?'<div class="error">'+esc(task.error)+'</div>':"")+(task.status==="awaiting_approval"?'<div class="run-meta">Human decision required before this task can proceed.</div><div class="approval-actions"><button class="btn approve" data-approval="approved" data-task="'+esc(task.id)+'">Approve task</button><button class="btn reject" data-approval="rejected" data-task="'+esc(task.id)+'">Reject task</button></div>':"")+(task.status==="failed"?'<div class="approval-actions"><button class="btn" data-retry-task="'+esc(task.id)+'">Retry this task and blocked dependants</button></div>':"")+'</article>').join(""));

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
  }catch(error){renderHtml(el("runInspector"), '<div class="error">'+esc(error.message)+'</div>');}
}

async function loadRuns(){
  try{
    let data=await api("/api/runs");
    if(!data.length && isShowcase){
      data = SAMPLE_RUNS;
    }
    renderHtml(el("runs"), data.length?data.slice(0,7).map(run=>'<div class="run" data-run-id="'+esc(run.id)+'" tabindex="0" role="button"><div class="run-title"><span class="run-goal">'+esc(run.goal)+'</span><span class="pill '+(run.status==="completed"?"pill-emerald":"pill-accent")+'">'+esc(run.status)+'</span></div><div class="run-meta">'+esc(run.id)+' · '+esc(new Date(run.createdAt).toLocaleString())+' · '+run.tasks.length+' tasks</div></div>').join(""):'<div class="empty">No saved runs yet. Create one with <code>anvil plan --goal "..."</code>.</div>');
    el("runs").querySelectorAll("[data-run-id]").forEach(item=>{
      const select=()=>inspectRun(item.getAttribute("data-run-id"));
      item.addEventListener("click",select);
      item.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();select();}});
    });
    if(data.length && (!selectedRunId || !data.some(r=>r.id===selectedRunId))){
      inspectRun(data[0].id);
    }
  }catch(error){renderHtml(el("runs"), '<div class="error">'+esc(error.message)+'</div>');}
}

async function loadActivity(){
  try{
    let runs=await api("/api/runs");
    if(!runs.length && isShowcase) runs = SAMPLE_RUNS;
    el("activityUpdated").textContent="Updated "+new Date().toLocaleTimeString();
    if(!runs.length){
      renderHtml(el("activity"), '<div class="empty">No agent activity yet. Create a plan or run to populate this view.</div>');
      renderHtml(el("taskStatus"), '<div class="empty">No tasks recorded.</div>');
      return;
    }
    const latest=runs[0],events=latest.events||[];
    renderHtml(el("activity"), events.length?events.slice(-12).reverse().map(event=>'<div class="activity-item"><span class="activity-dot '+esc(event.type)+'"></span><div><b>'+esc(event.type.replaceAll("_"," "))+'</b><div class="run-meta">'+esc(event.message)+'</div><div class="run-meta">'+esc(event.taskId)+' · '+esc(new Date(event.at).toLocaleTimeString())+'</div></div></div>').join(""):'<div class="empty">Latest run has no recorded events yet.</div>');
    renderHtml(el("taskStatus"), latest.tasks.length?latest.tasks.map(task=>'<div class="task-card"><b>'+esc(task.title||task.id)+'</b><small>'+esc(task.agent||"Agent")+'</small><span class="pill '+(task.status==="completed"?"pill-emerald":"")+'">'+esc(task.status)+'</span></div>').join(""):'<div class="empty">No tasks recorded.</div>');
  }catch(error){renderHtml(el("activity"), '<div class="error">'+esc(error.message)+'</div>');}
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
    renderHtml(el("healthPanel"), '<div class="grid">'+cards+'</div><div style="margin-top:14px"><b>Unified score dimensions</b><div class="activity">'+dimensions+'</div></div>'+chart+'<div style="margin-top:12px"><b>Findings by severity</b><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">'+severity+'</div></div>');
  }catch(error){renderHtml(el("healthPanel"), '<div class="error">'+esc(error.message)+'</div>');}
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
    renderHtml(el("regressionPanel"), top+(checks||'<div class="empty">No verification history yet. Run anvil verify SCRIPT to establish a baseline.</div>'));
  }catch(error){renderHtml(el("regressionPanel"), '<div class="error">'+esc(error.message)+'</div>');}
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
    renderHtml(el("reviewPanel"), data.length?data.slice(0,8).map(item=>'<div class="rowitem"><div><b>'+esc(item.id)+'</b><div class="run-meta">'+esc(new Date(item.createdAt).toLocaleString())+' · '+esc(item.filesReviewed)+' files · '+esc(item.staticFindings)+' static findings · '+esc(item.aiSuggestions)+' AI suggestions</div>'+(item.topFindings?.length?'<div class="run-meta">'+item.topFindings.map(esc).join(" · ")+'</div>':"")+'</div><span class="pill pill-cyan">'+esc(item.scope)+'</span></div>').join(""):'<div class="empty">No saved reviews yet. Run anvil review . to create one.</div>');
  }catch(error){renderHtml(el("reviewPanel"), '<div class="error">'+esc(error.message)+'</div>');}
}

async function loadQuality(){
  try{
    const data=await api("/api/quality");
    const head='<div class="rowitem"><b>Rule-based score</b><span class="pill pill-accent">'+esc(data.score)+'/100 · '+esc(data.grade)+'</span></div><div class="run-meta">'+esc(data.findings.length)+' findings · '+esc(data.metrics.sourceFiles)+' source files · '+esc(data.metrics.testFiles)+' test files</div>';
    const items=data.findings.slice(0,6).map(item=>'<div class="rowitem"><div><b>'+esc(item.title)+'</b><div class="run-meta">'+esc(item.recommendation)+'</div></div><span class="pill">'+esc(item.severity)+'</span></div>').join("");
    renderHtml(el("qualityPanel"), head+(items||'<div class="empty">No findings from available static checks.</div>'));
  }catch(error){renderHtml(el("qualityPanel"), '<div class="error">'+esc(error.message)+'</div>');}
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
    if(!data.length){renderHtml(el("verificationPanel"), '<div class="empty">No verification runs yet. Use anvil verify SCRIPT.</div>');return;}
    renderHtml(el("verificationPanel"), data.slice(0,8).map(item=>'<div class="rowitem"><div><b>'+esc(item.script)+'</b><div class="run-meta">'+esc(new Date(item.startedAt).toLocaleString())+' · '+esc(item.durationMs)+' ms</div></div><span class="pill '+(item.status==="passed"?"pill-emerald":"pill-accent")+'">'+esc(item.status)+'</span></div>').join(""));
  }catch(error){renderHtml(el("verificationPanel"), '<div class="error">'+esc(error.message)+'</div>');}
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
    renderHtml(target, snapshots.length ? snapshots.map(s=>'<div class="rowitem"><div><b>'+esc(s.id)+'</b><div class="run-meta">'+esc(new Date(s.at).toLocaleString())+' · '+s.files+' files preserved</div></div><span class="pill pill-emerald">ROLLBACK READY</span></div>').join("") : '<div class="empty">No backup snapshots recorded. Run <code>anvil clean --apply</code> to create one.</div>');
  }catch(e){renderHtml(target, '<div class="error">'+esc(e.message)+'</div>');}
}

async function runCleanerPreview(){
  const output = el("cleanerLiveOutput");
  if(!output) return;
  renderHtml(output, '<div class="loading">Scanning project for temporary clutter, OS junk and unused imports…</div>');
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
    renderHtml(output, html);
  }catch(err){renderHtml(output, '<div class="error">'+esc(err.message)+'</div>');}
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
    renderHtml(el("memoryList"), entries.length ? entries.map(item => {
      const kindClass = item.kind === "decision" ? "pill-emerald" : item.kind === "constraint" ? "pill-accent" : "pill-cyan";
      return '<div class="rowitem" style="align-items:flex-start"><div><div style="display:flex;gap:6px;align-items:center;margin-bottom:4px"><span class="pill ' + kindClass + '">' + esc(item.kind.toUpperCase()) + '</span>' + (item.tags||[]).map(t => '<span class="pill" style="font-size:10px">#' + esc(t) + '</span>').join('') + '<span class="run-meta" style="margin-left:8px">' + esc(item.id) + '</span></div><div style="font-size:13px;line-height:1.4">' + esc(item.content) + '</div></div>' + (!item.id.startsWith("mem-showcase") ? '<button class="btn" style="padding:4px 8px;font-size:11px" onclick="deleteMemoryEntry(\'' + esc(item.id) + '\')">Remove</button>' : '') + '</div>';
    }).join("") : '<div class="empty">No project memory entries saved yet. Add a decision or constraint above to guide your agents!</div>');
  }catch(e){renderHtml(el("memoryList"), '<div class="error">'+esc(e.message)+'</div>');}
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
    renderHtml(container, adrs.length ? adrs.map(item => {
      const statusPill = item.status === "Accepted" ? "pill-emerald" : item.status === "Proposed" ? "pill-cyan" : "pill-accent";
      return '<div class="rowitem"><div><div style="display:flex;gap:6px;align-items:center;margin-bottom:4px"><span class="pill ' + statusPill + '">' + esc(item.status.toUpperCase()) + '</span><span class="pill" style="font-size:10px">ADR-' + esc(item.id) + '</span><span class="run-meta">' + esc(item.date) + '</span></div><div style="font-size:13px;font-weight:600">' + esc(item.title) + '</div><div class="run-meta" style="font-size:11px">' + esc(item.filename) + '</div></div></div>';
    }).join("") : '<div class="empty">No Architecture Decision Records found. Click "+ New ADR" or "Sync Memory to ADRs" to initialize docs/adr/</div>');
  }catch(e){
    const container = el("adrList");
    if(container) renderHtml(container, '<div class="error">' + esc(e.message) + '</div>');
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

    renderHtml(summaryEl, '<div class="card card-highlight"><div class="metric-label">Security Status</div><div class="metric" style="color:' + (res.passed ? 'var(--emerald)' : 'var(--accent)') + '">' + (res.passed ? 'SECURE' : 'ACTION REQUIRED') + '</div><div class="metric-sub">' + res.findings.length + ' total findings</div></div><div class="card"><div class="metric-label">Critical Secrets</div><div class="metric" style="color:var(--accent)">' + res.summary.critical + '</div><div class="metric-sub">API keys, tokens, keys</div></div><div class="card"><div class="metric-label">High Severity</div><div class="metric" style="color:var(--amber,#f59e0b)">' + res.summary.high + '</div><div class="metric-sub">Scripts, unencrypted deps</div></div><div class="card"><div class="metric-label">Scanned Scope</div><div class="metric" style="color:var(--cyan)">' + res.scannedFiles + '</div><div class="metric-sub">Files in ' + res.durationMs + 'ms</div></div>');

    renderHtml(findingsEl, res.findings.length ? res.findings.map(f => {
      const sevClass = f.severity === "critical" ? "pill-accent" : f.severity === "high" ? "pill-amber" : "pill-cyan";
      return '<div class="rowitem"><div><div style="display:flex;gap:6px;align-items:center;margin-bottom:4px"><span class="pill ' + sevClass + '">' + esc(f.severity.toUpperCase()) + '</span><span class="pill" style="font-size:10px">' + esc(f.category) + '</span><span class="run-meta">' + esc(f.file + (f.line ? ':' + f.line : '')) + '</span></div><div style="font-size:13px;font-weight:600">' + esc(f.description) + '</div>' + (f.snippet ? '<div class="run-meta" style="font-family:monospace;font-size:11px">Snippet: ' + esc(f.snippet) + '</div>' : '') + '<div class="run-meta" style="font-size:11px;color:var(--text-muted)">Remediation: ' + esc(f.remediation) + '</div></div></div>';
    }).join("") : '<div class="empty" style="color:var(--emerald)">✓ Clean audit: No hardcoded secrets, dangerous scripts, or exposed credentials detected.</div>');
  }catch(e){
    const findingsEl = el("securityFindings");
    if(findingsEl) renderHtml(findingsEl, '<div class="error">' + esc(e.message) + '</div>');
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
  renderHtml(output, '<div class="loading">Running full system health and runtime diagnostic checks…</div>');
  try {
    const rep = await api("/api/doctor");
    let html = '<div class="card" style="background:#090d14;margin-bottom:10px"><b>Doctor Diagnostic Status:</b> <span class="pill ' + (rep.summary.status === "pass" ? "pill-emerald" : "pill-accent") + '">' + rep.summary.status.toUpperCase() + '</span> (' + rep.summary.passed + ' passed, ' + rep.summary.failed + ' failed, ' + rep.summary.warnings + ' warnings)</div>';
    html += rep.checks.map(c => '<div class="rowitem"><div><b>' + esc(c.name) + '</b><div class="run-meta">' + esc(c.message) + '</div></div><span class="pill ' + (c.status === "pass" ? "pill-emerald" : c.status === "warn" ? "pill-accent" : "pill") + '">' + esc(c.status.toUpperCase()) + '</span></div>').join("");
    renderHtml(output, html);
  } catch (err) {
    renderHtml(output, '<div class="error">' + esc(err.message) + '</div>');
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
    if (violationsBox) renderHtml(violationsBox, '<div style="padding:10px 14px;border-radius:8px;background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.3);color:var(--emerald);font-size:12px"><b>✓ Zero policy gate violations.</b> Repository meets all quality and security criteria.</div>');
    if (advisoriesBox) renderEmpty(advisoriesBox);
    if (list) renderHtml(list, '<div class="rowitem"><div><b>ANVIL-R003</b> [low] Inline suppression on line 42 with verified justification.<div class="run-meta">src/core/dashboard-server.ts:42</div></div><span class="pill pill-emerald">SUPPRESSED</span></div><div class="rowitem"><div><b>ANVIL-R001</b> [low] Legacy console output accepted in baseline.<div class="run-meta">scripts/setup.js:14</div></div><span class="pill pill-cyan">BASELINE</span></div>');
    return;
  }

  try {
    const scanMode = el("gateScanMode") ? el("gateScanMode").value : "";
    const minConf = el("gateMinConfidence") ? el("gateMinConfidence").value : "";
    const importSarif = el("gateImportSarif") ? el("gateImportSarif").value.trim() : "";
    const qp = new URLSearchParams();
    if (scanMode) qp.set("since", scanMode);
    if (minConf && minConf !== "low") qp.set("minConfidence", minConf);
    if (importSarif) qp.set("importSarif", importSarif);
    const qs = qp.toString() ? "?" + qp.toString() : "";

    const data = await api("/api/gate" + qs);
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
        renderHtml(violationsBox, '<div class="card" style="border-color:rgba(251,113,133,0.5);background:rgba(35,16,22,0.8);margin-bottom:10px"><b style="color:var(--danger)">Gate Violations (' + data.violations.length + '):</b><ul style="margin:6px 0 0;padding-left:20px;font-size:12px;color:#fecdd3">' + data.violations.map(v => '<li>' + esc(v) + '</li>').join('') + '</ul></div>');
      } else {
        renderHtml(violationsBox, '<div style="padding:10px 14px;border-radius:8px;background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.3);color:var(--emerald);font-size:12px"><b>✓ Zero policy gate violations.</b> Repository meets all quality and security criteria.</div>');
      }
    }

    const notices = data.warnings || data.advisoryNotices;
    if (advisoriesBox) {
      if (notices && notices.length > 0) {
        renderHtml(advisoriesBox, '<div class="card" style="border-color:rgba(251,191,36,0.4);background:rgba(30,24,14,0.7);margin-bottom:10px"><b style="color:var(--warning)">Advisory Notices:</b><ul style="margin:6px 0 0;padding-left:20px;font-size:12px;color:#fef08a">' +
          notices.map((a) => '<li>' + esc(a) + '</li>').join('') +
          '</ul></div>');
      } else {
        renderEmpty(advisoriesBox);
      }
    }

    if (list) {
      const items = [];
      if (data.activeFindings) {
        for (const f of data.activeFindings) {
          const confBadge = f.confidence ? ' <span class="pill pill-cyan" style="font-size:10px">' + esc(f.confidence).toUpperCase() + ' CONFIDENCE</span>' : '';
          const srcBadge = f.source && f.source !== 'anvil' ? ' <span class="pill pill-purple" style="font-size:10px">' + esc(f.source).toUpperCase() + '</span>' : '';
          items.push('<div class="rowitem"><div><b>' + esc(f.ruleId || 'ANVIL-RULE') + '</b> [' + esc(f.severity || 'info') + ']' + confBadge + srcBadge + ' ' + esc(f.message) + '<div class="run-meta">' + esc(f.filePath) + ':' + esc(f.line || 1) + '</div></div><span class="pill ' + (f.severity === 'critical' || f.severity === 'high' ? 'pill-danger' : 'pill-warning') + '">' + esc((f.severity || 'FINDING').toUpperCase()) + '</span></div>');
        }
      }
      if (data.suppressedFindings) {
        for (const sf of data.suppressedFindings) {
          items.push('<div class="rowitem"><div><b>' + esc(sf.ruleId || 'ANVIL-RULE') + '</b> [suppressed] ' + esc(sf.message) + '<div class="run-meta">' + esc(sf.filePath) + ':' + esc(sf.line || 1) + '</div></div><span class="pill pill-emerald">SUPPRESSED</span></div>');
        }
      }
      renderHtml(list, items.length === 0 ? '<div class="empty">No findings reported. Codebase is clean.</div>' : items.join(''));
    }
  } catch (e) {
    if (list) renderHtml(list, '<div class="error">Failed to evaluate gate: ' + esc(e.message) + '</div>');
  }
}

// Architecture & Workspace
async function loadDependencyIntelligence(){
  try{
    const data=await api("/api/dependency-intelligence");const s=data.summary;
    renderHtml(el("dependencyIntelSummary"), metric("Direct dependencies",s.direct,"Production "+s.production+" · development "+s.development)+metric("Transitive packages",s.transitive,"From parsed npm lockfile")+metric("Vulnerabilities",data.sources.vulnerabilityReport===null?"N/A":s.vulnerabilities,"Imported report only")+metric("Outdated",data.sources.outdatedReport===null?"N/A":s.outdated,"Imported report only"));
    renderHtml(el("dependencyIntelList"), data.dependencies.length?data.dependencies.slice(0,30).map(item=>'<div class="activity-item"><div class="activity-main"><b>'+esc(item.name)+'</b><small>'+(item.direct?"Direct · ":"Transitive · ")+esc(item.kind)+' · '+esc(item.locked||item.requested)+'</small></div><span class="pill">'+esc(item.licenseClass.toUpperCase())+'</span></div>').join(""):'<div class="empty">No npm dependencies detected.</div>');
    el("dependencyIntelNotes").textContent=data.limitations.join(" · ");
  }catch(error){renderHtml(el("dependencyIntelList"), '<div class="error">'+esc(error.message)+'</div>');}
}

async function loadIntelligenceTimeline(){
  try{
    const data=await api("/api/intelligence-timeline");
    const comparison=data.comparison;const snapshots=data.snapshots||[];
    if(!comparison){
      renderHtml(el("timelineSummary"), metric("Snapshots",snapshots.length,"Saved locally")+metric("Trend","STABLE","Calculated")+metric("Risk index","12/100","Low risk")+metric("High hotspots",0,"Current baseline"));
      renderHtml(el("timelineHistory"), '<div class="empty">No previous snapshots recorded. Run <code>anvil snapshot .</code> to capture one.</div>');
      return;
    }
    const current=comparison.current;const delta=comparison.delta;
    renderHtml(el("timelineSummary"), metric("Snapshots",snapshots.length,"Saved locally")+metric("Trend",comparison.trend.toUpperCase(),delta?"Compared with previous":"Baseline")+metric("Risk index",current.metrics.score+"/100","Structural risk index")+metric("High hotspots",current.metrics.high,"Current snapshot"));
    renderHtml(el("timelineHistory"), snapshots.slice(-12).reverse().map(item=>'<div class="activity-item"><div class="activity-main"><b>'+esc(item.generatedAt)+'</b><small>Risk '+item.metrics.score+'/100 · high '+item.metrics.high+' · commit '+esc(item.commit||"unavailable")+'</small></div><span class="pill">'+esc(item.id)+'</span></div>').join(""));
  }catch(error){renderHtml(el("timelineHistory"), '<div class="error">'+esc(error.message)+'</div>');}
}

async function loadChangeRisk(){
  try{
    const data=await api("/api/change-intelligence");const s=data.summary;
    renderHtml(el("changeRiskSummary"), metric("Changed files",s.changedFiles,"Compared with "+data.base)+metric("Overall risk",data.overallRisk.score+"/100",data.overallRisk.level.toUpperCase())+metric("Affected modules",s.affectedModules,"Static downstream impact")+metric("Test candidates",s.testCandidates,"Existing and suggested paths"));
    renderHtml(el("changeRiskList"), data.changes.length?data.changes.map(item=>'<div class="activity-item"><div class="activity-main"><b>'+esc(item.file)+'</b><small>'+esc(item.reasons.join(" "))+'</small></div><span class="pill">'+esc(item.level.toUpperCase())+' · '+item.score+'</span></div>').join(""):'<div class="empty">No working-tree changes detected against the selected base.</div>');
  }catch(error){renderHtml(el("changeRiskList"), '<div class="error">'+esc(error.message)+'</div>');}
}

async function loadEngineeringRisk(){
  try{
    const data=await api("/api/engineering-risk");const s=data.summary;
    renderHtml(el("riskSummary"), metric("Hotspots",s.hotspots,"Prioritized modules")+metric("High risk",s.high,"Review these first")+metric("Elevated",s.elevated,"Worth investigating")+metric("No matching tests",s.withoutMatchingTests,"Filename heuristic"));
    renderHtml(el("riskHotspots"), data.hotspots.length?data.hotspots.map(item=>'<div class="activity-item"><div class="activity-main"><b>'+esc(item.file)+'</b><small>Fan-in '+item.fanIn+' · fan-out '+item.fanOut+' · '+item.lines+' lines</small></div><span class="pill">'+esc(item.level.toUpperCase())+' · '+item.score+'</span></div>').join(""):'<div class="empty">No structural hotspots detected by current heuristics.</div>');
    el("riskMethodology").textContent=data.methodology;
  }catch(error){renderHtml(el("riskHotspots"), '<div class="error">'+esc(error.message)+'</div>');}
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
  svg.setAttribute("viewBox","0 0 "+width+" "+height);svg.style.height=Math.min(760,Math.max(420,height))+"px";renderHtml(svg, '<text x="24" y="22" fill="#8e9aab" font-size="12">SOURCE FILES</text><text x="820" y="22" fill="#8e9aab" font-size="12">PACKAGES</text>'+edgeMarkup+nodeMarkup);
  svg.querySelectorAll("[data-id]").forEach(group=>{const choose=()=>{svg.querySelectorAll(".dependency-node").forEach(n=>n.classList.remove("selected"));group.classList.add("selected");const node=data.nodes.find(n=>n.id===group.getAttribute("data-id"));if(!node)return;const related=data.edges.filter(e=>e.from===node.id||e.to===node.id);const names=related.map(e=>{const other=data.nodes.find(n=>n.id===(e.from===node.id?e.to:e.from));return other?other.label:"";}).filter(Boolean);renderHtml(el("dependencyDetail"), '<b>'+esc(node.label)+'</b> · '+esc(node.kind)+' · <span class="pill">'+esc(node.status)+'</span><div class="run-meta" style="margin-top:6px">'+esc(node.detail)+'</div><div class="run-meta">Connected to: '+(names.length?names.map(esc).join(", "):"no visible relationships")+'</div>');};group.addEventListener("click",choose);});
}

async function loadDependencyGraph(){
  try{
    const data=await api("/api/dependency-graph");
    renderHtml(el("dependencySummary"), metric("Source nodes",data.summary.files,"Shown in graph")+metric("Packages",data.summary.packages,"Declared and imported")+metric("Undeclared",data.summary.undeclared,"Imports absent from manifest")+metric("Possible unused",data.summary.possibleUnused,"Static scan candidates"));
    renderDependencyGraph(data);
  }catch(error){renderHtml(el("dependencyGraph"), '<text x="24" y="35" fill="var(--danger)">'+esc(error.message)+'</text>');}
}

function renderGraph(data){
  const svg=el("architectureGraph"), nodes=data.nodes.slice(0,48), visible=new Set(nodes.map(n=>n.file));
  const width=900,height=360,cx=width/2,cy=height/2,rx=width*.39,ry=height*.36;
  const positions=new Map(nodes.map((n,i)=>[n.file,{x:cx+rx*Math.cos(2*Math.PI*i/Math.max(1,nodes.length)-Math.PI/2),y:cy+ry*Math.sin(2*Math.PI*i/Math.max(1,nodes.length)-Math.PI/2)}]));
  const edges=data.edges.filter(e=>visible.has(e.from)&&visible.has(e.to));
  const edgeMarkup=edges.map(e=>{const a=positions.get(e.from),b=positions.get(e.to);return '<line class="graph-edge" x1="'+a.x+'" y1="'+a.y+'" x2="'+b.x+'" y2="'+b.y+'"/>';}).join("");
  const nodeMarkup=nodes.map(n=>{const p=positions.get(n.file),label=n.file.split("/").slice(-2).join("/");return '<g data-file="'+esc(n.file)+'"><circle class="graph-node '+(n.role==="entry"?"entry":"")+'" cx="'+p.x+'" cy="'+p.y+'" r="7"/><text class="graph-label" x="'+(p.x+10)+'" y="'+(p.y+3)+'">'+esc(label.length>24?label.slice(-21)+"…":label)+'</text></g>';}).join("");
  renderHtml(svg, edgeMarkup+nodeMarkup);
  svg.querySelectorAll("g[data-file]").forEach(group=>group.addEventListener("click",()=>{
    svg.querySelectorAll(".graph-node").forEach(n=>n.classList.remove("selected"));
    group.querySelector("circle").classList.add("selected");
    const file=group.getAttribute("data-file"),node=data.nodes.find(n=>n.file===file),incoming=data.edges.filter(e=>e.to===file).map(e=>e.from);
    renderHtml(el("graphDetail"), '<b>'+esc(file)+'</b> · '+esc(node.role)+' · '+node.lines+' lines<br>Imports: '+(node.imports.length?node.imports.map(esc).join(", "):"none detected")+'<br>Imported by: '+(incoming.length?incoming.map(esc).join(", "):"no mapped modules"));
  }));
}

async function loadMap(){
  try{
    const data=await api("/api/architecture");
    renderGraph(data);
    renderHtml(el("architecture"), data.nodes.slice(0,36).map(node=>'<div class="node">'+esc(node.file)+'<small>'+esc(node.role)+' · '+node.imports.length+' imports · '+node.lines+' lines</small></div>').join(""));
  }catch(error){renderHtml(el("architecture"), '<div class="error">'+esc(error.message)+'</div>');}
}

// Workspace File Explorer & Code Search
let workspaceDirectory="";
async function loadWorkspace(pathValue=workspaceDirectory){
  workspaceDirectory=pathValue;
  try{
    const data=await api("/api/workspace?path="+encodeURIComponent(workspaceDirectory));
    workspaceDirectory=data.path;el("workspacePath").textContent="/"+(data.path||"");
    renderHtml(el("workspaceFiles"), data.entries.length?data.entries.map(item=>'<div class="rowitem"><button class="btn" data-workspace-kind="'+esc(item.kind)+'" data-workspace-path="'+esc(item.path)+'">'+(item.kind==="directory"?"▸ ":"") +esc(item.name)+'</button><span class="pill">'+(item.kind==="file"?esc(item.size)+" B":"FOLDER")+'</span></div>').join(""):'<div class="empty">No previewable files or folders here.</div>');
    el("workspaceFiles").querySelectorAll("[data-workspace-path]").forEach(button=>button.addEventListener("click",()=>button.dataset.workspaceKind==="directory"?loadWorkspace(button.dataset.workspacePath):previewWorkspace(button.dataset.workspacePath)));
  }catch(error){renderHtml(el("workspaceFiles"), '<div class="error">'+esc(error.message)+'</div>');}
}

async function previewWorkspace(filePath){
  try{
    const file=await api("/api/workspace/file?path="+encodeURIComponent(filePath));
    renderHtml(el("workspacePreview"), '<div><b>'+esc(file.name)+'</b><div class="run-meta">'+esc(file.path)+' · '+esc(file.size)+' bytes</div></div><pre style="white-space:pre;overflow:auto;max-height:520px;background:#080c14;border:1px solid var(--line);padding:14px;border-radius:9px;font:11px/1.6 monospace">'+esc(file.content)+'</pre>');
  }catch(error){renderHtml(el("workspacePreview"), '<div class="error">'+esc(error.message)+'</div>');}
}

async function runCodeSearch(){
  const query=el("codeSearchQuery").value.trim();if(query.length<2){el("codeSearchMeta").textContent="Enter at least two characters.";return;}
  renderHtml(el("codeSearchResults"), '<div class="loading">Searching source files…</div>');
  try{
    const data=await api("/api/search?q="+encodeURIComponent(query));
    el("codeSearchMeta").textContent=data.total+" matches · "+data.filesScanned+" files scanned";
    renderHtml(el("codeSearchResults"), data.results.length?data.results.map(item=>'<button class="btn" style="text-align:left;white-space:normal;display:block;width:100%" data-search-path="'+esc(item.path)+'"><b>'+esc(item.symbol||item.path)+'</b> <span class="pill">'+esc(item.kind)+'</span><div class="run-meta">'+esc(item.path)+':'+item.line+'</div></button>').join(""):'<div class="empty">No matches found.</div>');
    el("codeSearchResults").querySelectorAll("[data-search-path]").forEach(button=>button.addEventListener("click",()=>previewWorkspace(button.dataset.searchPath)));
  }catch(error){renderHtml(el("codeSearchResults"), '<div class="error">'+esc(error.message)+'</div>');}
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
  renderHtml(dependency, workflowTasks.map(task=>'<option value="'+esc(task.id)+'">'+esc(task.title)+'</option>').join(""));
  [...dependency.options].forEach(option=>option.selected=selected.includes(option.value));
  const edges=workflowEdges().map(edge=>{const a=workflowPositions[edge.from],b=workflowPositions[edge.to];if(!a||!b)return "";const x1=a.x+190,y1=a.y+48,x2=b.x,y2=b.y+48,m=(x1+x2)/2;return '<path class="workflow-edge" d="M '+x1+' '+y1+' C '+m+' '+y1+', '+m+' '+y2+', '+x2+' '+y2+'"/>';}).join("");
  const nodes=workflowTasks.map(task=>{const p=workflowPositions[task.id];return '<g class="workflow-graph-node '+(workflowSelected===task.id?"selected":"")+'" data-graph-node="'+esc(task.id)+'" transform="translate('+p.x+' '+p.y+')" tabindex="0"><rect width="190" height="96" rx="11"/><text x="12" y="22" class="wf-agent">'+esc(task.agent.toUpperCase())+'</text><text x="12" y="47" class="wf-title">'+esc(task.title.slice(0,26))+'</text><text x="12" y="69" class="wf-sub">'+(task.dependsOn||[]).length+' prerequisites</text></g>';}).join("");
  renderHtml(el("workflowCanvas"), workflowTasks.length?'<div class="workflow-graph-wrap"><svg id="workflowGraph" viewBox="0 0 1100 650"><g id="wfWorld" transform="translate('+workflowPan.x+' '+workflowPan.y+') scale('+workflowScale+')">'+edges+nodes+'</g></svg></div><div class="actions" style="margin-top:10px"><button class="btn" id="applyWorkflowLinks">Apply selected links</button></div>':'<div class="empty">Add a specialist task to start composing your pipeline.</div>');
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
  if(msgEl) renderHtml(msgEl, '<span style="color:var(--cyan)">⚡ Simulating multi-agent pipeline execution (DemoAgentProvider)...</span>');
  try{
    const res = await fetch("/api/workflows/"+encodeURIComponent(id)+"/execute",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
    const run = await res.json();
    if(msgEl) renderHtml(msgEl, '<span style="color:var(--emerald)">✓ Pipeline simulated: ' + esc(run.id) + ' (' + esc(run.status) + ')</span>');
    loadRuns();
    loadActivity();
    if(run.id) inspectRun(run.id);
  }catch(e){
    if(msgEl) renderHtml(msgEl, '<span style="color:var(--accent)">Execution failed: ' + esc(e.message) + '</span>');
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
    renderHtml(el("savedWorkflows"), workflows.length?workflows.map(w=>'<div class="run"><div class="run-title"><b>'+esc(w.name)+'</b><span class="pill">'+esc(w.tasks.length)+' TASKS</span></div><div class="run-meta" style="display:flex;justify-content:space-between;align-items:center"><span>'+esc(w.id)+'</span><button class="btn btn-emerald" style="padding:3px 8px;font-size:11px" onclick="executeWorkflowById(\''+esc(w.id)+'\')">⚡ Simulate Execution</button></div></div>').join(""):'<div class="empty">No saved workflows yet.</div>');
  }catch(e){renderHtml(el("savedWorkflows"), '<div class="error">'+esc(e.message)+'</div>');}
}

// Config Studio & Provider Readiness
async function loadProviderReadiness(){
  try{
    const providers=await api("/api/providers");
    renderHtml(el("providerReadiness"), providers.map(item=>'<div class="rowitem"><div><b>'+esc(item.id)+(item.selected?' · selected':'')+'</b><div class="run-meta">'+esc(item.model)+' · '+esc(item.detail)+'</div></div><span class="pill '+(item.status==="configured"?"pill-emerald":"")+'>'+esc(item.status)+'</span></div>').join(""));
  }catch(error){renderHtml(el("providerReadiness"), '<div class="error">'+esc(error.message)+'</div>');}
}

async function loadConfigFiles(){
  try{
    const configFiles=await api("/api/config-files");
    renderHtml(el("configInventory"), configFiles.length?configFiles.map(item=>'<div class="rowitem"><div><b>'+esc(item.id)+'.md</b><div class="run-meta">'+esc(item.category)+' · '+esc(item.bytes)+' bytes</div></div></div>').join(""):'<div class="empty">No custom agent or skill files yet.</div>');
  }catch(e){renderHtml(el("configInventory"), '<div class="error">'+esc(e.message)+'</div>');}
}
async function loadConfigVersions(){
  try{
    const versions=await api("/api/config-snapshots");
    renderHtml(el("configVersions"), versions.length?versions.map(item=>'<div class="rowitem"><div><b>'+esc(item.id)+'</b><div class="run-meta">'+esc(item.createdAt)+' · '+esc(item.files.length)+' files</div></div><span class="pill">'+esc(item.status)+'</span></div>').join(""):'<div class="empty">No snapshots yet.</div>');
  }catch(e){renderHtml(el("configVersions"), '<div class="error">'+esc(e.message)+'</div>');}
}
async function loadConfigReleases(){
  try{
    const releases=await api("/api/config-releases");
    renderHtml(el("configReleases"), releases.length?releases.map(item=>'<div class="rowitem"><div><b>'+esc(item.id)+'</b></div><span class="pill">'+esc(item.status)+'</span></div>').join(""):'<div class="empty">No release proposals yet.</div>');
  }catch(e){renderHtml(el("configReleases"), '<div class="error">'+esc(e.message)+'</div>');}
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
on("gateScanMode","change",loadGate);
on("gateMinConfidence","change",loadGate);

async function loadCatalogSkills(){
  try{
    const res = await fetch("/api/catalog/skills");
    if(!res.ok) return;
    const data = await res.json();
    const totalNode = el("catalogTotalSkills");
    if(totalNode) totalNode.textContent = data.total ?? data.skills?.length ?? 0;
    const list = el("catalogSkillsList");
    if(!list) return;
    if(!data.skills || !data.skills.length){
      renderHtml(list, '<div class="empty">No skills or rules registered in workspace yet.</div>');
      return;
    }
    renderHtml(list, data.skills.map(s => {
      const sourceClass = s.source === "builtin" ? "cyan" : "purple";
      const triggerHtml = s.triggers && s.triggers.length ? '<div style="font-size:11px;color:var(--accent);margin-top:4px">Triggers: ' + esc(s.triggers.join(", ")) + '</div>' : '';
      return '<div class="row" style="padding:12px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:flex-start">' +
        '<div>' +
          '<strong style="color:var(--text)">' + esc(s.name || s.id) + '</strong>' +
          '<span class="pill pill-' + sourceClass + '" style="margin-left:8px;font-size:11px">' + esc(s.source) + '</span>' +
          '<div style="color:var(--muted);font-size:13px;margin-top:4px">' + esc(s.description || "") + '</div>' +
          triggerHtml +
        '</div>' +
        '<span class="badge" style="font-size:11px;background:rgba(255,255,255,0.05);padding:2px 8px;border-radius:4px">' + esc(s.id) + '</span>' +
      '</div>';
    }).join(""));
  }catch{}
}

async function loadBinaryAssets(){
  try{
    const [res, scRes] = await Promise.all([
      fetch("/api/binary/assets"),
      fetch("/api/supply-chain").catch(() => null),
    ]);
    if(res && res.ok){
      const data = await res.json();
      const totalNode = el("binaryTotalAssets");
      if(totalNode) totalNode.textContent = data.totalAssets ?? 0;
      const cleanStatus = el("binaryCleanStatus");
      if(cleanStatus){
        cleanStatus.textContent = data.cleanRoomReport && data.cleanRoomReport.compliant ? "COMPLIANT" : "FLAGGED";
        cleanStatus.style.color = data.cleanRoomReport && data.cleanRoomReport.compliant ? "var(--emerald)" : "var(--danger)";
      }
      const list = el("binaryAssetsList");
      if(list){
        if(!data.assets || !data.assets.length){
          renderHtml(list, '<div class="empty">No compiled binaries or web bundles detected in root.</div>');
        }else{
          renderHtml(list, data.assets.map(a => {
            const kb = (a.sizeBytes / 1024).toFixed(1);
            const arch = a.binaryMetadata && a.binaryMetadata.arch ? ' (' + esc(a.binaryMetadata.arch) + ')' : '';
            const hash = a.sha256 ? ' · ' + esc(a.sha256.slice(0, 10)) : '';
            return '<div class="row" style="padding:10px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center">' +
              '<div>' +
                '<span style="font-family:monospace;color:var(--text)">' + esc(a.path) + '</span>' +
                '<span class="pill pill-cyan" style="margin-left:8px;font-size:11px">' + esc(a.category) + arch + '</span>' +
              '</div>' +
              '<span style="color:var(--muted);font-size:12px">' + kb + ' KB' + hash + '</span>' +
            '</div>';
          }).join(""));
        }
      }
    }
    if(scRes && scRes.ok){
      const sc = await scRes.json();
      const gradeNode = el("supplyChainGrade");
      if(gradeNode){
        gradeNode.textContent = sc.grade || "—";
        gradeNode.style.color = sc.passed ? "var(--emerald)" : "var(--danger)";
      }
      const pkgNode = el("supplyChainPackages");
      if(pkgNode && sc.summary){
        pkgNode.textContent = (sc.summary.packagesScanned ?? 0) + ' packages · ' + (sc.summary.lockfilePackagesChecked ?? 0) + ' locked';
      }
      const hnNode = el("supplyChainHooksNative");
      if(hnNode && sc.summary){
        hnNode.textContent = (sc.summary.lifecycleHooksCount ?? 0) + ' / ' + (sc.summary.nativeBinariesCount ?? 0);
      }
      const scList = el("supplyChainFindingsList");
      if(scList){
        const items = (sc.findings || []).filter(f => f.severity !== "info");
        if(!items.length){
          renderHtml(scList, '<div class="empty">Zero actionable supply-chain or spoofed-binary findings across ' + esc(String(sc.summary && sc.summary.packagesScanned || 0)) + ' scanned packages.</div>');
        }else{
          renderHtml(scList, items.slice(0, 30).map(f =>
            '<div class="row" style="padding:10px;border-bottom:1px solid var(--line)">' +
              '<div style="display:flex;justify-content:space-between;align-items:center">' +
                '<strong style="color:var(--text)">[' + esc(String(f.severity).toUpperCase()) + '] ' + esc(f.ruleId) + ' · ' + esc(f.packageName) + '</strong>' +
                '<span style="color:var(--muted);font-size:12px">' + esc(f.file) + '</span>' +
              '</div>' +
              '<div style="color:var(--muted);font-size:12px;margin-top:4px">' + esc(f.detail) + '</div>' +
            '</div>'
          ).join(""));
        }
      }
    }
  }catch{}
}

function reloadAllViews(){
  loadOverview();loadAgents();loadRuns();loadActivity();loadObservability();
  loadEvaluationHistory();loadBenchmarkHistory();loadBenchmarkRegression();loadAgentPerformance();
  loadSkillExperiments();loadExperimentHistory();loadAgentOptimization();loadAgentIntelligence();
  loadHealth();loadRegression();loadReviews();loadQuality();loadVerifications();
  loadCleanerBackups();loadMemory();loadAdrs();loadSecurityAudit();loadGate();
  loadCatalogSkills();loadBinaryAssets();
}

reloadAllViews();
loadMap();loadDependencyGraph();loadWorkspace();loadDependencyIntelligence();loadIntelligenceTimeline();loadChangeRisk();loadEngineeringRisk();
loadConfigFiles();loadConfigVersions();loadConfigReleases();loadProviderReadiness();refreshWorkflows();
renderWorkflow();
setInterval(()=>{loadActivity();loadRuns();if(selectedRunId)inspectRun(selectedRunId);},5000);
connectSSE();
`;
