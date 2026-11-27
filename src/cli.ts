#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { COMMANDS } from "./commands/index.js";

function resolveVersion(): string {
  try {
    const pkgUrl = new URL("../package.json", import.meta.url);
    const raw = readFileSync(pkgUrl, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.version === "string") return parsed.version;
  } catch {}
  return "1.1.1";
}

const VERSION = resolveVersion();

const HELP = `
ANVIL — The AI Engineering Workbench

Usage:
  anvil <command> [options]

Commands:
  init [path]      Create a safe, local-first .anvil starter workspace
  install [path]   Connect ANVIL MCP, hooks, and catalog packs (--profile, --with)
  repair [path]    Restore or update installed ANVIL harness files without losing edits
  uninstall [path] Remove ANVIL from those AI tools (use --target to pick)
  inspect [path]   Analyze project languages, tooling, dependencies, and scripts
  evaluate RUNID  Score a saved run against a local evaluation suite
  benchmark [RUN_ID] [--suite SUITE_ID] [--path PROJECT]  Record or view benchmark results
  benchmark-matrix CONFIG.json --suite SUITE_ID --goal "..." [--path PROJECT]  Run model comparisons
  benchmark-regression [MATRIX_ID] [--path PROJECT]  Compare latest matrix with its baseline
  optimize-agents [--path PROJECT]  Recommend evidence-based agent improvements
  agent-intelligence [--suite ID] [--candidate ID] [--limit N] [--json] [--path PROJECT]  Score agent effectiveness across benchmark history
  agent-evolution MATRIX_ID [--path PROJECT]  Evaluate a controlled baseline/treatment experiment
  experiment-studio <create|compare> [options]  Scaffold a skill or multi-model experiment
  experiment-history [--suite ID] [--candidate ID] [--limit N] [--json] [--path PROJECT]  Rank historical benchmark candidates
  agent-config <snapshot|list|show|diff|approve> [options]  Version and review agent/skill configuration
  agent-release <prepare|list|show|approve|reject> [options]  Gate agent configuration promotion
  experiment <capture|show|compare> [options]  Capture and compare reproducible benchmark manifests
  quality [path]   Generate an evidence-based static engineering quality report
  clean [path]     Clean workspace junk files and logs; use --apply to delete, --fix to repair code
  fix [path]       Auto-fix code issues, unused imports, and formatting
  deps [path]       Analyze npm dependencies, licenses, and imported security reports
  remediate [path] Advisory remediation plan for vulnerable and outdated dependencies
  snapshot [path]   Capture a local engineering intelligence snapshot
  timeline [path]   Compare the latest snapshot with its predecessor
  change-risk [path] Analyze changed-file risk, downstream impact, and test candidates
  risk [path]      Rank engineering hotspots using dependency and quality signals
  health [path]    Generate a unified engineering score, evidence coverage, and health snapshot
  deep [path]      Analyze AST symbols, circular imports, and change impact
  git [path]       Analyze changed files, impact, suggested tests, and risk
  impact [path]    Analyze dependency change blast radius and undeclared imports
  search QUERY     Symbol-aware source code search (use --limit N, --path PROJECT)
  review [path]    Review changed source files; add --ai for provider-backed suggestions
  review-history [path] List saved review snapshots
  review-show ID   Display one saved review snapshot
  review-compare A B Compare two saved reviews
  patch-check ID N  Dry-run validate AI patch N from a saved review
  patch-approve REVIEW_ID N --reviewer NAME  Formally record human approval for AI suggestion N
  patch-approval-check ID  Verify cryptographic approval validity and expiration
  patch-stage APPROVAL_ID  Stage approved patch in an isolated temporary workspace
  patch-review STAGE_ID    Review staged patch diff against source without modifying project
  regression [path] Compare verification history with Git changes and impact
  verify --list    Discover available npm scripts without running them
  verify SCRIPT    Explicitly run one selected npm script and record its result
  patch-verify ID SCRIPT  Verify an approved staged patch in a temporary workspace
  sandbox-status         Inspect Docker availability and advertised security options
  sandbox-compliance [PROFILE] [IMAGE@sha256:DIGEST] Generate a sandbox compliance report
  sandbox-policy-check POLICY.json Validate a fail-closed sandbox policy file
  sandbox-profiles [NAME] List or inspect built-in sandbox security profiles
  sandbox-cleanup        Review stopped ANVIL containers; add --apply to remove them
  sandbox-cleanup-history [PATH] Show recorded cleanup activity
  verify-history   List saved verification runs for a project
  map [path]       Map source modules and import relationships
  agents [path]    List built-in and workspace agent roles
  memory <action>  Manage local project memory (add, list, remove, context)
  adr <action>     Manage Architecture Decision Records (init, new, list, sync)
  mcp [subcommand] Manage pinned MCP servers and sync across AI tools (catalog, list, add, remove, sync, setup)
  skills [path]    List built-in and workspace skills
  hooks [path]     List configured declarative lifecycle hooks
  agent-security [path] Audit agent instructions, skills, hooks, and permissions
  security [path]  Audit repository for hardcoded secrets, keys, and script vulnerabilities
  gate [path]      Deterministic CI quality & security gate with SARIF and policy enforcement
  plan --goal TEXT Create and save a reviewable draft plan
  run --goal TEXT  Run the plan using a configured AI provider
  runs [path]      List locally saved run history (add --json for versioned JSON)
  evals [path]     List local agent evaluation suites
  trace RUNID      Show per-agent execution telemetry
  replay RUNID     Create a new run from retryable failed tasks
  resume RUNID     Continue pending or approved tasks in a saved run
  approve RUNID TASK_ID  Approve a task awaiting human review
  show-run ID      Display one saved run (use --path for project directory)
  clean [path]     Scan and delete junk, logs, temp downloads; add --apply and --fix
  fix [path]       Auto-repair code errors, trim whitespace & prune unused imports (add --verify)
  undo [path]      Rollback the last anvil clean/fix operation using saved snapshot backup
  hook [install|remove]  Install or remove ANVIL automated pre-commit hook in Git (use --force to overwrite)
  hook stop --harness claude|cursor  Agent stop hook: gate the agent's changes (installed by anvil install --hooks)
  binary [path]    Inspect binary assets, bundles, WASM, magic headers, and provenance compliance
  app <file>       Look inside an APK, IPA, Electron asar, WASM, source map or JS bundle (no external tools)
  doctor [path]    Run environment health checks; add --fix to auto-scaffold config
  scorecard [path] Check harness readiness (0-10) across install, guards, quality, memory, CI
  consult QUERY    Find matching skills, agents, commands, rules, and MCP servers
  context [path]   Estimate context budget and token consumption
  status [path]    Summarize harness install, guard, context and MCP health
  guard <check|log|status>  Dry-run Guard on a command or file, and see what it blocked
  catalog          List installable agents, skills, commands and rules (--kind, --json)
  analyze [path]   Profile the repo and save an anvil-project skill for agents (--write)
  plugin build     Generate the Claude Code plugin from the catalog (--check in CI)
  statusline [path] Output compact ANSI statusline for terminal and IDEs
  instinct <learn|list|add|promote|reject|enforce> Continuous learning habits and compiled Guard rules
  evolve [path]    Compile active learned instincts into workspace skills
  cost [path]      Report session and daily token spend and USD estimates
  race <run|list>  Competitive multi-agent race across isolated Git worktrees
  loop [path]      Autonomous self-healing verification loop
  shield [path]    Static security audit running 60 Shield rules across all harnesses
  harnesses        List the capability matrix of every supported AI coding tool
  dashboard [path] Start the local read-only web dashboard
  version          Print the installed version
  help             Show this help message

Options:
  --json           Output machine-readable JSON
  --help           Show command usage

Examples:
  anvil inspect .
  anvil clean .
  anvil clean . --apply --fix
  anvil inspect ./my-app --json
  anvil map .
  anvil agents .
  anvil plan --goal "Add authentication safely"
  anvil run --goal "Review the API design"
  anvil runs .
  anvil replay anvil-RUN-ID
  anvil approve anvil-RUN-ID TASK_ID
  anvil resume anvil-RUN-ID
  anvil dashboard .
`.trim();

async function main(args: string[]): Promise<void> {
  const [command = "help", ...rest] = args;
  switch (command) {
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(`${HELP}\n`);
      return;
    case "version":
    case "--version":
    case "-v":
      process.stdout.write(`anvil ${VERSION}\n`);
      return;
  }
  const handler = COMMANDS.get(command);
  if (!handler) {
    process.stderr.write(`Unknown command: ${command}\nRun "anvil help" to see available commands.\n`);
    process.exitCode = 1;
    return;
  }
  await handler(command, rest);
}

void main(process.argv.slice(2));
