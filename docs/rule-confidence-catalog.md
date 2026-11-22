# ANVIL Rule Confidence & Precision Catalog

## Overview

ANVIL provides deterministic static pattern analysis designed specifically for automated CI/CD gating and AI coding assistant evaluation. Unlike traditional linters that produce uniform alerts regardless of context, ANVIL applies a **three-tiered confidence model** (`high`, `medium`, `low`) combined with **context-aware AST/string inspection**.

By default, the Policy-as-Code gate (`anvil gate`) sets `quality.minConfidence = "medium"`, ensuring that low-confidence heuristic findings (such as occurrences inside string literals, documentation comments, or template definitions) are demoted to non-blocking advisory notices rather than failing builds.

---

## Confidence Tiers

| Tier | Meaning | CI Gate Impact (Default Policy) | When Assigned |
|---|---|---|---|
| **High** | High-precision pattern with unambiguous code syntax (e.g. direct function call, credential entropy match, `@ts-ignore`). | Blocks gate if severity exceeds threshold (`maxCritical`, `maxHigh`). | Direct AST/code calls (`eval(x)`, `new Function()`, verified secrets). |
| **Medium** | Legitimate API usage that requires context review (e.g. shell execution, DOM innerHTML assignment, empty catch block). | Blocks gate only if `maxMedium` threshold is exceeded or `--fail-on-warnings` is active. | Standard code occurrences of sensitive APIs without active exploit flags. |
| **Low** | Heuristic match occurring inside string literals, documentation strings, comments, or template declarations. | **Non-blocking advisory notice**; never fails the gate unless explicitly configured (`quality.minConfidence = "low"`). | Word `eval()` or `innerHTML =` inside quotes or documentation strings. |

---

## Static Review Rule Catalog

### `ANVIL-R001`: Dynamic Code Evaluation
- **Severity:** `High`
- **Pattern:** `/\beval\s*\(|\bnew\s+Function\s*\(/`
- **Base Confidence:** `High`
- **Context Detection:**
  - `High`: Direct statement invocation: `eval(payload)` or `const f = new Function(...)`.
  - `Low`: Occurrence inside single quotes, double quotes, backticks, or comments (e.g. `const msg = "Avoid eval() execution"`).
- **Recommendation:** Avoid evaluating generated strings. Prefer explicit parsers or allow-listed operations.

### `ANVIL-R002`: Shell Execution API Usage
- **Severity:** `Medium`
- **Pattern:** `/\b(?:exec|execSync|execFile|execFileSync|spawn|spawnSync)\s*\(/`
- **Base Confidence:** `Medium`
- **Context Detection:**
  - `High`: Invocation with `shell: true`, shell string concatenation (`+ userInput`), or template interpolation (`${cmd}`).
  - `Medium`: Safe array argument invocation: `execFileSync("git", ["status"])`.
  - `Low`: Occurrence inside string literals or description text.
- **Recommendation:** Review argument handling, executable allow-lists, and whether shell mode is enabled. Prefer argument arrays and avoid shell interpolation.

### `ANVIL-R003`: HTML Injection Sink
- **Severity:** `Medium`
- **Pattern:** `/\.(?:innerHTML|outerHTML)\s*=/`
- **Base Confidence:** `Medium`
- **Context Detection:**
  - `Medium`: Direct DOM property assignment: `element.innerHTML = content`.
  - `Low`: Occurrence inside string templates, HTML mockup strings, or markdown renderers.
- **Recommendation:** Avoid assigning untrusted strings to HTML sinks. Use `textContent` or a vetted sanitizer.

### `ANVIL-R004`: TypeScript Error Suppression
- **Severity:** `Low`
- **Pattern:** `/@ts-ignore\b/`
- **Base Confidence:** `High`
- **Context Detection:**
  - `High`: Actual directive comment preceding code.
  - `Low`: Mention in documentation string.
- **Recommendation:** Prefer `@ts-expect-error` with an explanation, or correct the underlying type mismatch.

### `ANVIL-R005`: Potentially Empty Catch Block
- **Severity:** `Low`
- **Pattern:** `/catch\s*(?:\([^)]*\))?\s*\{\s*\}/`
- **Base Confidence:** `Medium`
- **Context Detection:**
  - `Medium`: Real empty block `catch {}`.
  - `Low`: Match inside string literal or regex test.
- **Recommendation:** Handle, report, or deliberately document the error instead of silently discarding it.

### `ANVIL-R006`: Dangerously Injected HTML Property
- **Severity:** `Medium`
- **Pattern:** `/dangerouslySetInnerHTML/`
- **Base Confidence:** `High`
- **Context Detection:**
  - `High`: React/JSX property assignment `<div dangerouslySetInnerHTML={{ __html: content }} />`.
  - `Low`: Mention inside documentation or mock fixtures.
- **Recommendation:** Ensure content is trusted or sanitized immediately before rendering.

---

## Security Scanner Secret Patterns

All security scanner secret rules execute with **High Confidence** and **Critical Severity** by default (`failOnSecrets: true`):

| Rule ID | Category | Target Credential | Detection Logic |
|---|---|---|---|
| `openai-api-key` | Secret | OpenAI API Key | `sk-[a-zA-Z0-9]{20,}` / `sk-proj-...` prefix with format verification. |
| `anthropic-api-key` | Secret | Anthropic API Key | `sk-ant-[a-zA-Z0-9_-]{20,}` pattern match. |
| `github-token` | Secret | GitHub Token | `ghp_...`, `gho_...`, `github_pat_...` standard format tokens. |
| `aws-access-key` | Secret | AWS Access Key ID | `AKIA[0-9A-Z]{16}` standard AWS identifier format. |
| `google-api-key` | Secret | Google Cloud API Key | `AIza[0-9A-Za-z\\-_]{35}` format verification. |
| `slack-token` | Secret | Slack API Token | `xox[baprs]-[0-9a-zA-Z]{10,48}` format verification. |
| `private-key` | Secret | Private Cryptographic Key | `BEGIN (?:RSA|OPENSSH|EC|DSA) PRIVATE KEY` header markers. |
| `unignored-sensitive-files` | Configuration | Sensitive Unignored Files | Unignored `.env`, `.pem`, `.key`, `.pfx` checked against `.gitignore`. |

---

## Configuring Confidence in `.anvil/policy.json`

Teams configure the minimum confidence threshold in `.anvil/policy.json`:

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
