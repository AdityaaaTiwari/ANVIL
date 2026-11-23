# Everything Claude Code (ECC) Integration

This guide explains how to pair [affaan-m/ECC (Everything Claude Code)](https://github.com/affaan-m/ECC) with ANVIL to establish a complete AI-assisted development and verification pipeline.

---

## Overview: The Skills & Verification Partnership

- **`affaan-m/ECC`** provides the **Knowledge & Skills Layer**: 1,500+ curated prompts, agent rules, and domain-specific workflows (Next.js, Rust, Go, Python, Cloudflare, Docker). It guides AI agents on *how to write idiomatic code*.
- **ANVIL** provides the **Deterministic Verification Layer**: local AST blast-radius analysis, security auditing, and automated stop hooks. It *proves the code is safe and passes policy before merge*.

```text
[ Developer asks for feature/bugfix ]
                 │
                 ▼
[ AI Agent uses ECC Skills ] ───> Follows `plan -> test -> implement -> review`
                 │
                 ▼
[ AI Agent attempts to finish ]
                 │
                 ▼
[ ANVIL Stop Hook intercepts ] ───> Runs `anvil gate --diff`
                 │
                 ├──> Gate Passed ──> Merges cleanly to local branch
                 └──> Gate Failed ──> Provides top 10 actionable findings, agent self-heals
```

---

## ⚡ Quick Start: Combining ECC and ANVIL

### 1. Install ANVIL with Stop Hooks
In your project repository, run:

```bash
npx -y anvil-engineering-workbench install . --hooks
```

This configures:
- `.mcp.json` / `.cursor/mcp.json` with ANVIL's local deterministic MCP tools.
- Native stop hooks in `.claude/settings.json` and `.cursor/hooks.json` to automatically trigger `anvil gate --diff` whenever the agent completes an action.
- Standard guidelines in `AGENTS.md` and `CLAUDE.md`.

### 2. Apply ECC Skills
Install or load ECC skills and subagents for your preferred coding assistant (Claude Code, Cursor, Codex, OpenCode).

### 3. Verify Agent Changes Automatically
When the agent finishes applying changes using ECC guidelines, ANVIL's stop hook automatically intercepts the event:
- If the agent wrote compliant code: **Passes silently**.
- If the agent introduced dangerous functions (`eval()`), hardcoded credentials, or broke downstream test targets: **The hook blocks completion and returns file:line findings for immediate self-healing**.

---

## 🔒 Security Auditing for ECC Skill Packs

Community-curated agent rules and skills can introduce security risks (such as adversarial prompt injections, hidden Unicode characters, or dangerous bash commands).

ANVIL includes a dedicated agent security scanner to audit skill packs:

```bash
# Scan all local skills and instruction files
anvil agent-security .

# Scan global user configs (~/.claude, ~/.cursor, ~/.codex, Windsurf)
anvil agent-security . --global
```

### What ANVIL Scans in ECC Skills:
- **`ANVIL-AGENT-101` (Hidden Unicode):** Detects zero-width spaces (`U+200B`) and bidirectional text override characters that hide instructions from humans while being read by LLMs.
- **`ANVIL-AGENT-102` (Prompt Injection):** Detects jailbreak phrases, instructions to hide agent behavior from users, or overrides hidden inside HTML comments (`<!-- ... -->`).
- **`ANVIL-AGENT-105` (Piped Remote Scripts):** Identifies hooks or custom commands that run `curl ... | sh` or `wget ... | bash`.
- **`ANVIL-AGENT-110` (Credential Exfiltration):** Flags commands that combine outbound network utilities with environment variable access.

---

## 🔁 The ECC + ANVIL Development Lifecycle

ECC defines a structured agent workflow: `plan -> test -> implement -> review -> verify -> remember -> improve`.

Here is how ANVIL maps to and reinforces each stage:

| ECC Lifecycle Stage | ANVIL Tool / Mechanism | Benefit |
|---|---|---|
| **1. Plan** | `anvil_map_architecture`, `anvil_inspect_project` | Explores module imports and entry points in ~1,400 tokens instead of reading dozens of raw files (~150k tokens). |
| **2. Test** | `anvil_git_intelligence`, `anvil_change_risk` | Computes exact downstream blast radius and recommends specific test targets. |
| **3. Implement** | ECC Domain Skills | Agent authors clean code following framework best practices. |
| **4. Review** | `anvil_quality_audit`, `anvil agent-security` | Static quality heuristics, secret scanning, and permission verification. |
| **5. Verify** | `anvil gate --diff`, Stop Hook (`anvil install --hooks`) | Intercepts agent finish, blocks regressions, and exports SARIF reports. |
| **6. Remember & Improve**| `anvil adr new`, `anvil adr sync` | Records Architectural Decision Records (ADRs) to persist design memory locally. |

---

## 💡 Best Practices

1. **Keep Secrets in Environment Variables:** Always reference API keys and tokens using environment variable substitution (`${VAR}`) rather than embedding them in `.mcp.json` or skill prompts.
2. **Use Inline Suppressions Judiciously:** If a rule triggers on an intentional pattern, use reasoned inline suppressions:
   ```ts
   // anvil-disable-next-line ANVIL-R001 -- validated parser handles untrusted input
   ```
3. **Run Full Gate Before Pull Request:**
   ```bash
   anvil gate .
   ```
