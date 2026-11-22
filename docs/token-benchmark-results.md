# ANVIL Empirical Token & Context Footprint Benchmark

> **Benchmark Date:** 2026-11-22  
> **Target Workspace:** `ANVIL`  
> **Methodology:** Direct character count measurement and standard token estimation (`Math.ceil(characters / 4)`).  
> **Reproducibility:** Run `npx tsx scripts/measure-token-footprint.ts` to verify locally.

## Executive Summary

When an AI coding assistant (Claude, Cursor, Copilot, Antigravity) answers architectural or risk questions, it typically reads multiple raw source files, configuration manifests, and documentation into its context window. 

**ANVIL executes analysis entirely locally on CPU without LLM calls**, condensing complex AST graphs, dependency trees, and security scans into compact, structured JSON payloads. This eliminates unnecessary context window consumption.

| Total Unassisted Tokens | ANVIL Compact Tokens | Measured Reduction | Net Token Savings |
|-------------------------|----------------------|--------------------|-------------------|
| **224,808 tokens** | **2,212 tokens** | **~99% reduction** | **222,596 tokens** |

---

## Scenario Breakdown

| Scenario | Unassisted Approach | Unassisted Footprint | ANVIL MCP (Compact) | ANVIL Footprint | Reduction | Duration |
|---|---|---|---|---|---|---|
| **1. Project Overview & Tech Stack** | Reading package.json, tsconfig.json, and README.md (~full text) | 43,588 chars (~10,897 tokens) | anvil_inspect_project (compact summary) | 862 chars (~216 tokens) | **-98%** | 24ms |
| **2. Architecture & Module Dependency Mapping** | Reading all 30 source files to trace imports and entry points | 607,424 chars (~151,856 tokens) | anvil_map_architecture (compact summary) | 5,712 chars (~1,428 tokens) | **-99%** | 211ms |
| **3. Change Risk & Blast Radius Analysis** | Reading modified files and manually tracing downstream callers | 42,176 chars (~10,544 tokens) | anvil_change_risk (compact summary) | 1,790 chars (~448 tokens) | **-96%** | 832ms |
| **4. Quality & Security Pre-Commit Audit** | Reading config files, workflows, and sample source files for manual review | 206,041 chars (~51,511 tokens) | anvil_quality_audit + anvil_security_audit (compact) | 477 chars (~120 tokens) | **-100%** | 143ms |

---

## Detailed Scenario Notes

### 1. Project Overview & Tech Stack Inspection
- **Unassisted:** The agent loads `README.md`, `package.json`, and `tsconfig.json` to identify dependencies, build scripts, and repository guidelines.
- **ANVIL Compact:** `anvil_inspect_project` parses manifests locally and returns only detected languages, package managers, framework tags, dependency counts, script names, and warnings.

### 2. Architecture & Module Dependency Mapping
- **Unassisted:** To understand the project structure and imports, the agent must read dozens of source files across `src/`.
- **ANVIL Compact:** `anvil_map_architecture` builds an in-memory AST import graph across all supported languages (TypeScript, Python, Go, Rust, Java, C++) and returns entry points, total module counts, external package frequencies, and high-level sample nodes.

### 3. Change Risk & Blast Radius Analysis
- **Unassisted:** The agent reads modified files, git status, and attempts to trace downstream callers by manually grepping the repo.
- **ANVIL Compact:** `anvil_change_risk` computes graph blast radius, downstream dependency impact, and candidate test targets deterministically using Git and static AST analysis.

### 4. Quality & Security Pre-Commit Audit
- **Unassisted:** The agent reads configuration manifests, CI workflow YAMLs, and sample source files looking for security leaks and code quality issues.
- **ANVIL Compact:** `anvil_quality_audit` and `anvil_security_audit` execute local heuristic rules and entropy-based secret scanning in milliseconds, returning severity counts and only high-priority findings.

---

## How to Reproduce
```bash
# Run the benchmark locally on this repository
npx tsx scripts/measure-token-footprint.ts
```
