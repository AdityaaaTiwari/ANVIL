# ANVIL False-Positive Analysis & Rule Triage

## Overview
This document provides a transparent, reproducible analysis of findings produced by ANVIL's static review (`anvil review`) and security scanner (`anvil security`) when executed on the ANVIL repository itself.

---

## 1. Finding Distribution & Triage (ANVIL v1.1.1 Codebase)

A full unscoped scan of the ANVIL codebase (~35,000 lines of code) identified **165 raw findings**. Engineering triage categorized them as follows:

| Rule ID | Severity | Heuristic Pattern | Raw Count | Heuristic False Positives (String / Template Matches) | Legitimate CLI / Utility Usages (Baselined) | Actual Vulnerabilities | Resolution & Triage Notes |
|---|---|---|---|---|---|---|---|
| **ANVIL-R003** | Medium | `innerHTML =` / `outerHTML =` | 114 | 114 | 0 | 0 | 112 occurrences in `src/core/dashboard-server.ts` are client-side DOM templates embedded within the backend server for local dashboard rendering; 2 in test fixtures. Resolved via `/* anvil-disable-file ANVIL-R003 */`. |
| **ANVIL-R001** | High | `eval()` / `new Function()` | 4 | 4 | 0 | 0 | 2 occurrences were rule description/remediation strings in `security-scanner.ts` mentioning the word `eval()`; 2 were test mock fixtures. Resolved via `// anvil-disable-line ANVIL-R001`. |
| **ANVIL-R002** | Medium | `spawn` / `execSync` / `execFile` | 23 | 0 | 23 | 0 | Legitimate process execution for CLI subcommands (`git`, `docker`, `npm`). Baselined under `.anvil/baseline.json`. |
| **ANVIL-R005** | Low | `catch {}` | 24 | 0 | 24 | 0 | Defensive cleanup routines (e.g. `try { unlinkSync(f) } catch {}`). Baselined under `.anvil/baseline.json`. |
| **ANVIL-R004** | Low | `@ts-ignore` | 1 | 0 | 1 | 0 | Type compatibility shim in legacy provider adapter. Baselined under `.anvil/baseline.json`. |
| **ANVIL-R006** | Medium | `dangerouslySetInnerHTML` | 1 | 0 | 1 | 0 | Markdown report preview renderer. Baselined under `.anvil/baseline.json`. |
| **Total** | - | - | **165** | **118** | **47** | **0** | **0 Critical, 0 High, 0 Hardcoded Secrets** |

---

## 2. Suppression Mechanisms & Governance

ANVIL provides a three-tiered governance hierarchy to handle heuristic static analysis findings:

### Tier 1: Auditable Inline Source Suppressions
For files that legitimately construct DOM elements or define static rule documentation:
```typescript
// Single line suppression:
const desc = "Avoid eval() execution"; // anvil-disable-line ANVIL-R001 -- description string

// Next-line suppression:
// anvil-disable-next-line ANVIL-R002 -- verified git execution
execFileSync("git", ["status"]);

// File-level suppression:
/* anvil-disable-file ANVIL-R003 -- embedded local dashboard templates */
```
**Auditability & Justifications:** Every inline suppression is tracked and reported in `evaluation.summary.inlineSuppressions` and exported in SARIF reports with `suppressions: [{ kind: "inSource" }]`. Teams can strictly disallow inline suppressions in CI by configuring `"allowInlineSuppressions": false`, or mandate that every suppression contains an explicit justification reason via `"requireSuppressionReason": true` in `.anvil/policy.json`.

### Tier 2: Content-Hashed Baseline Engine
Legacy projects can adopt the gate immediately without blocking CI by generating a baseline of existing findings:
```bash
# Generate baseline snapshot
npx anvil-engineering-workbench gate . --generate-baseline .anvil/baseline.json

# Enforce gate with baseline
npx anvil-engineering-workbench gate . --baseline .anvil/baseline.json
```
Fingerprints use SHA-256 hashes of the matching code snippet, ensuring line insertions or deletions above a finding do not invalidate the baseline.

### Tier 3: Policy as Code (`.anvil/policy.json`)
Teams configure deterministic thresholds with strict schema validation:
```json
{
  "version": 1,
  "security": {
    "maxCritical": 0,
    "maxHigh": 0,
    "maxMedium": 15,
    "failOnSecrets": true
  },
  "quality": {
    "maxReviewHigh": 0,
    "requireCleanGit": true,
    "allowInlineSuppressions": true,
    "requireSuppressionReason": false
  }
}
```

---

## 3. Reproducing the Analysis

To reproduce this analysis on the ANVIL codebase or any target project:
```bash
# 1. Run raw gate check with JSON output
npx anvil-engineering-workbench gate . --json

# 2. View active findings and suppression summary
npx anvil-engineering-workbench gate . --baseline .anvil/baseline.json
```
