# Agent Stop Hooks (`anvil install --hooks`)

ANVIL can automatically gate an AI coding agent's changes right when the agent signals that it has finished working, preventing regressions and policy violations from ever being presented as "done".

With `anvil install --hooks`, ANVIL registers a native stop hook with supported agents (Claude Code and Cursor). When the agent attempts to stop or declare victory, the hook runs `anvil gate --diff` against the active changes in the working tree. If policy violations or vulnerabilities exist, the hook intercepts completion, provides the agent with structured feedback, and prompts it to fix the issues autonomously.

---

## 🔄 The Verification Flow

```text
[ AI Agent writes code ]
          │
          ▼
[ Agent attempts to complete/stop ]
          │
          ▼
[ ANVIL Stop Hook intercepts event ]
          │
   Runs: anvil gate --diff
          │
          ├──> [ PASSED ] ──> Agent completes silently and exits
          │
          └──> [ FAILED ] ──> Intercepts stop event:
                              - Displays top 10 blocking findings (most severe first)
                              - Shows exact file:line locations and rule IDs
                              - Instructs agent to remediate issues before finishing
                              - Agent resumes work and self-heals
```

---

## ⚡ Installation

Install stop hooks alongside MCP server registration in your repository:

```bash
# Register MCP servers and configure stop hooks for Claude Code and Cursor
npx -y anvil-engineering-workbench install . --hooks
```

To scope to specific tools:
```bash
# Install hooks only for Cursor and Claude Code
anvil install . --hooks --target claude,cursor
```

---

## 🛠️ Supported Tools & Hook Configurations

| Tool | Hook Location | Trigger & Protocol |
|---|---|---|
| **Claude Code** | `.claude/settings.json` (`hooks.Stop`) | Fires on agent `Stop` event. Responds with `{ "decision": "block", "reason": "<feedback>" }`. |
| **Cursor** | `.cursor/hooks.json` (`hooks.stop`) | Fires on agent completion event. Responds with `{ "followup_message": "<feedback>" }`. |
| **Other Tools** (Copilot, Antigravity, Codex, etc.) | `.git/hooks/pre-commit` | Other tools do not yet provide native client-side stop hooks. Gated via `anvil hook install` pre-commit hook. |

### Preserves Existing Hooks
ANVIL's installer safely merges into `.claude/settings.json` and `.cursor/hooks.json` without modifying or removing any existing user hooks.

---

## 🔁 Loop Guards & Safety Limits

To guarantee that agents do not become stuck in infinite evaluation loops:

- **Claude Code Loop Guard (`stop_hook_active`):** Claude Code passes `stop_hook_active: true` when it has already continued once after a gate failure. ANVIL detects this flag and permits the agent to stop, allowing at most **1 follow-up**.
- **Cursor Loop Guard (`loop_count`):** Cursor tracks iterations via `loop_count`. ANVIL allows at most **2 follow-ups** (`loop_count < 2`). When `loop_count >= 2`, ANVIL stops checking and returns `{}`.
- **Aborted / Non-Completed Runs:** If Cursor signals a status other than `"completed"` (e.g. `"aborted"` or `"error"`), the hook stays silent and does not block.
- **Fail-Open Resilience:** If ANVIL itself encounters an unhandled exception or crash, the hook exits gracefully without blocking the agent.

---

## 🧹 Removal & Uninstallation

To remove ANVIL's stop hooks and restore your configurations:

```bash
anvil uninstall .
```

- Removes ANVIL's hook commands from `.claude/settings.json` and `.cursor/hooks.json`.
- If no user hooks remain, `.cursor/hooks.json` is cleanly deleted.
- If existing user hooks were present, they are preserved byte-for-byte.
