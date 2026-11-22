# ANVIL False-Positive Analysis & Rule Triage

## Overview
This document provides a transparent, reproducible analysis of findings produced by ANVIL's static review (`anvil review`), security scanner (`anvil security`), and gatekeeper (`anvil gate`) across releases.

---

## 1. Finding Distribution & Historical Triage (ANVIL v1.1.1 Baseline)

An unscoped scan of the raw ANVIL codebase (~35,000 lines of code) identified **165 raw heuristic findings**. Engineering triage categorized them as follows:

| Rule ID | Severity | Heuristic Pattern | Raw Count | Heuristic False Positives (String / Template Matches) | Legitimate CLI / Utility Usages (Baselined) | Actual Vulnerabilities | Resolution & Triage Notes |
|---|---|---|---|---|---|---|---|
| **ANVIL-R003** | Medium | `innerHTML =` / `outerHTML =` | 114 | 114 | 0 | 0 | 112 occurrences in `src/core/dashboard-server.ts` were client-side DOM templates embedded within the backend server for local dashboard rendering; 2 in test fixtures. Resolved via string context detection & `/* anvil-disable-file ANVIL-R003 */`. |
| **ANVIL-R001** | High | `eval()` / `new Function()` | 4 | 4 | 0 | 0 | 2 occurrences were rule description/remediation strings in `security-scanner.ts` mentioning the word `eval()`; 2 were test mock fixtures. Demoted to `confidence: "low"` via string-aware AST inspection. |
| **ANVIL-R002** | Medium | `spawn` / `execSync` / `execFile` | 23 | 0 | 23 | 0 | Legitimate process execution for CLI subcommands (`git`, `docker`, `npm`). Baselined under `.anvil/baseline.json`. |
| **ANVIL-R005** | Low | `catch {}` | 24 | 0 | 24 | 0 | Defensive cleanup routines (e.g. `try { unlinkSync(f) } catch {}`). Baselined under `.anvil/baseline.json`. |
| **ANVIL-R004** | Low | `@ts-ignore` | 1 | 0 | 1 | 0 | Type compatibility shim in legacy provider adapter. Baselined under `.anvil/baseline.json`. |
| **ANVIL-R006** | Medium | `dangerouslySetInnerHTML` | 1 | 0 | 1 | 0 | Markdown report preview renderer. Baselined under `.anvil/baseline.json`. |
| **Total** | - | - | **165** | **118** | **47** | **0** | **0 Critical, 0 High, 0 Hardcoded Secrets** |

---

## 2. The Four-Tier Governance Hierarchy in ANVIL v1.1.2+

In response to false-positive triage, ANVIL introduced a multi-layered governance hierarchy that eliminates noisy false positives without sacrificing security vigilance:

```
┌────────────────────────────────────────────────────────┐
│  Tier 0: Rule Confidence Tiers (High / Medium / Low)   │
│  Context-aware string & comment detection.             │
│  Low confidence demoted to advisory by default.        │
└────────────────────────────────────────────────────────┘
                           │
┌────────────────────────────────────────────────────────┐
│  Tier 1: PR-Diff Mode (`--since origin/main`)          │
│  Evaluates ONLY files modified in the active PR/diff.  │
│  Legacy baseline untouched files never block CI.       │
└────────────────────────────────────────────────────────┘
                           │
┌────────────────────────────────────────────────────────┐
│  Tier 2: Auditable Inline Source Suppressions          │
│  `anvil-disable-line` with mandatory justification.    │
│  Exported to SARIF inSource records for audit trails.  │
└────────────────────────────────────────────────────────┘
                           │
┌────────────────────────────────────────────────────────┐
│  Tier 3: Content-Hashed Baseline Engine                │
│  SHA-256 snippet hashing prevents line-shift drift.   │
└────────────────────────────────────────────────────────┘
                           │
┌────────────────────────────────────────────────────────┐
│  Tier 4: Policy as Code (`.anvil/policy.json`)         │
│  Deterministic numeric limits & fail-closed schema.    │
└────────────────────────────────────────────────────────┘
```

### Tier 0: Rule Confidence & String Context Demotion
ANVIL now inspects whether patterns appear inside string literals, documentation, or comments. For example:
- `eval(payload)` is categorized as **High Confidence** (`severity: high`).
- `const msg = "Avoid eval() execution"` is categorized as **Low Confidence** (`severity: high`, `confidence: low`).
Under the default policy (`quality.minConfidence = "medium"`), low-confidence matches are automatically demoted to non-blocking advisory notices, immediately eliminating 118 heuristic false positives.

### Tier 1: PR-Diff Gate Mode (`--since <ref>`)
In CI pull requests, teams run:
```bash
npx anvil-engineering-workbench gate . --since origin/main --sarif gate.sarif
```
Any violations present in untouched legacy files are reported as `suppressedByDiff` and do not block the PR. The gate fails only if the diff itself introduces new vulnerabilities.

### Tier 2: Auditable Inline Source Suppressions
For files that legitimately construct DOM elements or define static rule documentation:
```typescript
// Single line suppression with reason:
const desc = "Avoid eval() execution"; // anvil-disable-line ANVIL-R001 -- description string

// Next-line suppression:
// anvil-disable-next-line ANVIL-R002 -- verified git execution
execFileSync("git", ["status"]);

// File-level suppression:
/* anvil-disable-file ANVIL-R003 -- embedded local dashboard templates */
```
Every inline suppression is tracked and reported in `evaluation.summary.inlineSuppressions` and exported in SARIF reports with `suppressions: [{ kind: "inSource" }]`. Teams can mandate justifications via `"requireSuppressionReason": true`.

### Tier 3: Content-Hashed Baseline Engine
Legacy projects can adopt the gate immediately by snapshotting existing findings:
```bash
# Generate baseline snapshot
npx anvil-engineering-workbench gate . --generate-baseline .anvil/baseline.json

# Enforce gate with baseline
npx anvil-engineering-workbench gate . --baseline .anvil/baseline.json
```

### Tier 4: Policy as Code (`.anvil/policy.json`)
Teams configure deterministic thresholds with strict schema validation:
```json
{
  "version": 1,
  "security": {
    "maxCritical": 0,
    "maxHigh": 0,
    "maxMedium": 10,
    "failOnSecrets": true
  },
  "quality": {
    "maxReviewHigh": 0,
    "minConfidence": "medium",
    "diffOnly": false,
    "allowInlineSuppressions": true,
    "requireSuppressionReason": false
  }
}
```

---

## 3. Measured Impact on Gate Precision

| Metric | Before (v1.1.0 Heuristics) | After (v1.1.2+ Confidence + PR-Diff) | Improvement |
|---|---|---|---|
| **Raw Heuristic Hits on Self** | 165 | 165 | Maintained for full transparency |
| **Blocking False Positives** | 118 | **0** | **100% reduction in spurious CI blocks** |
| **Active Gate Precision** | 28.5% | **>95%** | High/Medium confidence findings represent legitimate audit targets |
| **PR Merge Interruption** | High (blocked on legacy code) | **Zero on clean PRs** | Enabled via `--since origin/main` |
