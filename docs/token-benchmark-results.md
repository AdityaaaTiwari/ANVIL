# ANVIL Empirical Token & Context Footprint Benchmark

> **Benchmark Date:** 2026-11-22  
> **Target Workspace:** `ANVIL`  
> **Methodology:** Direct character count measurement and character-count token estimation (`Math.ceil(characters / 4)`, not a real tokenizer). Baselines are fixed file reads, not an end-to-end agent run.  
> **Reproducibility:** Run `npx tsx scripts/measure-token-footprint.ts` to verify locally.

## Executive Summary

When an AI coding assistant (Claude, Cursor, Copilot, Antigravity) answers architectural or risk questions, it typically reads multiple raw source files, configuration manifests, and documentation into its context window. 

**ANVIL executes analysis entirely locally on CPU without LLM calls**, condensing complex AST graphs, dependency trees, and security scans into compact, structured JSON payloads. This eliminates unnecessary context window consumption.

| Total Unassisted Tokens | ANVIL Compact Tokens | Measured Reduction | Net Token Savings |
|-------------------------|----------------------|--------------------|-------------------|
| **224,850 tokens** | **2,216 tokens** | **~99% reduction** | **222,634 tokens** |

---

## Scenario Breakdown

| Scenario | Unassisted Approach | Unassisted Footprint | ANVIL MCP (Compact) | ANVIL Footprint | Reduction | Duration |
|---|---|---|---|---|---|---|
| **1. Project Overview & Tech Stack** | Reading package.json, tsconfig.json, and README.md (~full text) | 43,664 chars (~10,916 tokens) | anvil_inspect_project (compact summary) | 862 chars (~216 tokens) | **-98%** | 69ms |
| **2. Architecture & Module Dependency Mapping** | Reading all 30 source files to trace imports and entry points | 607,424 chars (~151,856 tokens) | anvil_map_architecture (compact summary) | 5,712 chars (~1,428 tokens) | **-99.1%** | 816ms |
| **3. Change Risk & Blast Radius Analysis** | Reading 5 representative src/core files (stand-in for the files a change touches) | 42,176 chars (~10,544 tokens) | anvil_change_risk (compact summary) | 1,808 chars (~452 tokens) | **-95.7%** | 2413ms |
| **4. Quality & Security Pre-Commit Audit** | Reading config files, workflows, and sample source files for manual review | 206,135 chars (~51,534 tokens) | anvil_quality_audit + anvil_security_audit (compact) | 477 chars (~120 tokens) | **-99.8%** | 594ms |

---

## Detailed Scenario Notes

### 1. Project Overview & Tech Stack Inspection
- **Unassisted:** The agent loads `README.md`, `package.json`, and `tsconfig.json` to identify dependencies, build scripts, and repository guidelines.
- **ANVIL Compact:** `anvil_inspect_project` parses manifests locally and returns only detected languages, package managers, framework tags, dependency counts, script names, and warnings.

### 2. Architecture & Module Dependency Mapping
- **Unassisted:** To understand the project structure and imports, the agent must read dozens of source files across `src/`.
- **ANVIL Compact:** `anvil_map_architecture` builds an in-memory AST import graph across all supported languages (TypeScript, Python, Go, Rust, Java, C++) and returns entry points, total module counts, external package frequencies, and high-level sample nodes.

### 3. Change Risk & Blast Radius Analysis
- **Unassisted:** Stand-in baseline: the script reads the first 5 `.ts` files under `src/core`. It does not read the real git diff or trace callers, so this row is an approximation.
- **ANVIL Compact:** `anvil_change_risk` computes graph blast radius, downstream dependency impact, and candidate test targets deterministically using Git and static AST analysis.

### 4. Quality & Security Pre-Commit Audit
- **Unassisted:** The agent reads configuration manifests, CI workflow YAMLs, and sample source files looking for security leaks and code quality issues.
- **ANVIL Compact:** `anvil_quality_audit` and `anvil_security_audit` execute local heuristic rules and entropy-based secret scanning in milliseconds, returning severity counts and only high-priority findings.

---

## MCP Session Startup Overhead & Net Token Economics

An AI coding assistant loads tool schema declarations once per session via the MCP `tools/list` handshake.

- **Full Tool Schema Payload (40 tools with backwards-compatible aliases):** 27,319 characters (~6,830 estimated tokens)
- **Primary Tool Schema Payload (20 canonical `anvil_*` tools):** ~13,659 characters (~3,415 estimated tokens)

### Multi-Step Session Net Token Economics
In an engineering workflow where an agent evaluates project stack, maps architecture, analyzes change blast radius, and runs a pre-commit quality gate:

| Step | Unassisted Approach | ANVIL MCP (Payload + Overhead) | Net Context Difference |
|---|---|---|---|
| **Session Handshake (`tools/list`)** | 0 tokens (no tools loaded) | ~6,830 tokens (40 tools registered) | +6,830 tokens (one-time setup) |
| **1. Tech Stack Inspection** | ~10,897 tokens | ~216 tokens | **-10,681 tokens (-98.0%)** |
| **2. Architecture Map** | ~151,856 tokens | ~1,428 tokens | **-150,428 tokens (-99.1%)** |
| **3. Change Risk Analysis** | ~10,544 tokens | ~448 tokens | **-10,096 tokens (-95.8%)** |
| **4. Quality & Security Audit** | ~51,511 tokens | ~120 tokens | **-51,391 tokens (-99.8%)** |
| **Total Net Workflow Tokens** | **224,850 tokens** | **9,046 tokens** (2,216 responses + 6,830 handshake) | **-215,804 net tokens (~96% NET REDUCTION)** |

> **Conclusion on Overhead:** Even when accounting for the full 6,830-token one-time MCP handshake, ANVIL delivers a **~96% net context reduction** on multi-step engineering tasks because single architecture or quality inspections save 50,000 to 150,000+ tokens each.

---

## Limitations (read before quoting these numbers)
- **Not an agent run.** These figures compare the size of a compact ANVIL response with the size of a fixed set of files. They do not measure how many tokens a real agent spends, and agents often use grep or targeted reads rather than reading every file.
- **Not equivalent information.** A compact summary omits detail. The percentages show payload size only, not that the agent can answer the same question from it. Use `detail: true` when you need the full graph.
- **Estimated tokens.** Tokens are `characters / 4`, which varies by model and content.
- **One repository.** Results come from ANVIL itself. Other repositories will differ, so run the script on yours.
- **Tool-definition overhead accounted for above.** The initial session handshake is ~6,830 tokens for all 40 declarations, which amortizes over the session to deliver ~96% net savings as shown above.

---

## How to Reproduce
```bash
# Run the benchmark locally on this repository
npx tsx scripts/measure-token-footprint.ts
```
