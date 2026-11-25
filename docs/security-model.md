# ANVIL Security & Audit Model

This document outlines the security architecture, detection engines, heuristic precision model, policy enforcement, and baseline workflows in ANVIL.

## Overview

ANVIL operates as a local-first engineering workbench. It runs completely offline on the developer's workstation or within CI runners. No code, AST symbols, API credentials, or Git history are ever transmitted to external servers without explicit user command.

## Detection Engines & Precision Model

ANVIL combines heuristic pattern matching, abstract syntax tree (AST) inspection, and dependency auditing across three primary layers:

### 1. Secret & Credential Detection
Scans project files for hardcoded tokens, API credentials, and private cryptographic keys using high-entropy regex patterns and provider prefix validation:
- **OpenAI:** `sk-[A-Za-z0-9_-]{20,}`
- **Anthropic:** `sk-ant-[A-Za-z0-9_-]{20,}`
- **GitHub:** `ghp_[A-Za-z0-9]{36}`, `gho_[A-Za-z0-9]{36}`, `github_pat_[A-Za-z0-9_]{82}`
- **AWS:** Access keys (`AKIA[0-9A-Z]{16}`)
- **Google:** `AIza[0-9A-Za-z\\-_]{35}`
- **Slack:** Bot/user tokens (`xoxb-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}`)
- **Private Keys:** PEM/OpenSSH headers (`BEGIN RSA/OPENSSH/EC/DSA PRIVATE KEY`)

### 2. Dangerous Script & Command Patterns
- Detection of unvetted command pipelines: e.g. `curl ... | bash` or `wget ... | sh`.
- Detection of insecure HTTP dependencies: `http://` URLs in `package.json` dependencies instead of secure HTTPS registries.

### 3. AI Agent Configuration & Instruction Security
Scans AI agent instructions, MCP configurations, settings, hooks, and permissions (`anvil agent-security`):
- **Hidden Unicode & Trojan Source:** Detects invisible zero-width and directional control characters (`U+200B`..`U+200F`, `U+202A`..`U+202E`, tag characters) used to conceal adversarial prompt injections in Markdown instructions.
- **Adversarial Prompt Injection:** Identifies instruction-override directives, developer/jailbreak modes, instructions to hide agent behavior from users, and prompts hidden inside HTML comments (`<!-- ... -->`).
- **MCP Server Hardening:** Scans MCP server configs (`.mcp.json`, `.cursor/mcp.json`, `opencode.json`, Codex TOML) for plain-text credentials in `env`, `headers`, or URLs, unencrypted remote HTTP endpoints, and unpinned package runners (`npx`, `bunx`, `uvx`).
- **Excessive Agent Permissions:** Flags dangerous pre-approved permissions such as unrestricted `Bash(*)` execution, `bypassPermissions` modes, and automatic trust for arbitrary cloned MCP servers.
- **Harmful Commands & Exfiltration:** Identifies hooks and launch scripts that pipe downloads directly into shells or combine network tools with access to secrets and private keys.

For detailed rules and remediation guidance, see the [AI Agent Security Audit Guide](agent-security.md).

### 4. Code Review & Risk Heuristics
- Detection of dangerous dynamic execution primitives (`eval(`, `new Function(`).
- Command injection risk in process spawns without shell escaping or parameterization.
- Circular dependency cycles across multi-language imports (TypeScript, Python, Go, Rust, Java, C/C++).

## Policy-as-Code & Gate Enforcement

The `anvil gate` command enforces deterministic thresholds configured via `.anvil/policy.json` or an explicit `--policy <path>`.

### Policy Specification (`docs/anvil-policy.schema.json`)
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "version": 1,
  "security": {
    "maxCritical": 0,
    "maxHigh": 0,
    "maxMedium": 10,
    "failOnSecrets": true
  },
  "quality": {
    "maxReviewHigh": 0,
    "requireCleanGit": false
  }
}
```

### Exit Codes:
- `0`: Gate passed (all findings within policy limits).
- `1`: Gate failed (one or more policy limits violated or critical/high findings detected).

## Baseline Workflow (Zero-Day Adoption)

To adopt ANVIL's CI gate on an existing codebase without failing builds on existing technical debt:

1. **Generate Baseline:**
   ```bash
   anvil gate --generate-baseline .anvil/baseline.json
   ```
2. **Commit Baseline:**
   Commit `.anvil/baseline.json` to version control.
3. **Enforce in CI:**
   ```bash
   anvil gate --baseline .anvil/baseline.json
   ```
   All existing findings recorded in the baseline are suppressed. Only newly introduced security flaws, secrets, or high-risk patterns will fail the gate.

## Automated Remediation & Safe Rollback

- **Auto-Fix Secrets via `.gitignore`:** Run `anvil security --fix` to automatically append exposed credential files (`.env`, `.pem`, `.key`) to `.gitignore`.
- **Byte-Accurate Undo:** Run `anvil undo` to roll back any automated code fix or cleanup operation with byte-level accuracy from `.anvil/backups/`.

## Reporting Vulnerabilities

To report a vulnerability in ANVIL confidentially, use GitHub Private Vulnerability Reporting at:
👉 **[Open a Security Advisory on GitHub](https://github.com/anvil-workbench/ANVIL/security/advisories/new)**
