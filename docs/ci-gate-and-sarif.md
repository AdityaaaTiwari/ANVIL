# CI Quality Gate & SARIF Integration Guide

ANVIL provides a deterministic, zero-configuration CI/CD quality gate designed to run in GitHub Actions, GitLab CI, or local pre-commit hooks. It guarantees that AI coding assistants and developers adhere to security policies, do not leak credentials, and do not introduce unreviewed high-risk patterns.

---

## 10-Line Copy-Paste GitHub Actions Workflow

Add `.github/workflows/anvil-gate.yml` to your repository:

```yaml
name: ANVIL Quality & Security Gate
on: [push, pull_request]

jobs:
  gate:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
      pull-requests: write
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@39370e3970a6d050c480ffad4ff0ed4d3fdee5af # v4.1.0
        with: { node-version: 20 }
      - name: Run ANVIL Gate (PR-Diff Mode)
        run: npx -y anvil-engineering-workbench gate . --since origin/${{ github.base_ref || 'main' }} --sarif gate.sarif
      - name: Upload SARIF to GitHub Code Scanning
        uses: github/codeql-action/upload-sarif@48ab28a6f5dab2a823c7a4007679df8b12c38da7 # v3.28.0
        if: always()
        with: { sarif_file: gate.sarif }
```

---

## Key CI Modes & Capabilities

### 1. PR-Diff Mode (`--since <ref>`)
In pull requests, failing on pre-existing legacy issues stops development. Pass `--since origin/main` to only fail on files modified in the PR:
```bash
npx anvil-engineering-workbench gate . --since origin/main --sarif gate.sarif
```
- Untouched legacy files are marked as `suppressedByDiff` in the summary.
- New secrets or high-severity vulnerabilities introduced by the PR will immediately fail the gate (exit code `1`).

### 2. Multi-Tool SARIF Aggregation (`--import-sarif <path>`)
ANVIL acts as the unified gatekeeper, aggregating findings from external linters like Semgrep, CodeQL, or Snyk under one policy:
```bash
# 1. Run external tools
semgrep --config auto --sarif -o semgrep.sarif .

# 2. Let ANVIL evaluate both native checks AND Semgrep in one unified policy gate:
npx anvil-engineering-workbench gate . --import-sarif semgrep.sarif --sarif combined.sarif
```

### 3. Automated PR Comments with GitHub CLI
Post a clean summary directly to the PR:
```yaml
      - name: Comment on PR
        if: failure() && github.event_name == 'pull_request'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh pr comment ${{ github.event.pull_request.number }} --body "### ❌ ANVIL Quality Gate Failed
          ANVIL detected blocking policy violations or unhandled secrets in modified files.
          Please check the **Security** tab for detailed line annotations."
```

### 4. Content-Hashed Baseline Snapshot
For large legacy projects adopting ANVIL for the first time:
```bash
# Generate baseline snapshot of existing findings
npx anvil-engineering-workbench gate . --generate-baseline .anvil/baseline.json

# Enforce gate with baseline (new findings fail, old findings pass)
npx anvil-engineering-workbench gate . --baseline .anvil/baseline.json
```
Fingerprints use SHA-256 hashes of snippet contents so line insertions/deletions above a finding do not invalidate the baseline.

---

## Exit Codes

| Exit Code | Meaning |
|---|---|
| `0` | Gate passed: all policy thresholds and security checks satisfied. |
| `1` | Gate failed: critical/high vulnerabilities, hardcoded secrets, or policy violations detected. |
