# ANVIL CI Gate & SARIF Integration

ANVIL provides a deterministic, zero-cloud CI quality gate that evaluates repositories against security policies and emits standard OASIS SARIF v2.1.0 output for GitHub pull requests.

---

## The `anvil gate` Command

```bash
# Run the gate on current repository
anvil gate .

# Run gate with SARIF export
anvil gate . --sarif anvil-results.sarif

# Enforce strict zero-warning policy
anvil gate . --fail-on-warnings

# Machine-readable JSON output for CI pipelines
anvil gate . --json
```

### Exit Codes
- `0`: **Passed** — All security and code-review checks satisfied policy thresholds.
- `1`: **Failed** — Critical/high security findings (or unhandled policy violations) detected.

---

## GitHub Actions Integration

Use ANVIL directly in your GitHub Actions workflow to gate pull requests and populate code scanning alerts in the GitHub Security tab:

```yaml
name: ANVIL CI Gate

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions:
  contents: read
  security-events: write

jobs:
  anvil-gate:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2

      - name: Run ANVIL Quality & Security Gate
        uses: anvil-workbench/ANVIL@v1.1.1
        with:
          operation: gate
          sarif-file: anvil-results.sarif

      - name: Upload SARIF to GitHub Security Tab
        if: always()
        uses: github/codeql-action/upload-sarif@6bb034416e76712ecb87902537147d808027170e # v3.28.10
        with:
          sarif_file: anvil-results.sarif
          category: anvil-workbench
```

---

## PR Comments & Step Summary

When executed inside GitHub Actions, `anvil gate` automatically appends an executive summary table to `$GITHUB_STEP_SUMMARY`, giving reviewers instant visibility into:
- Total files scanned
- Critical / High / Medium / Low findings
- Remediation guidance for any failed gates
