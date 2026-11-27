# ANVIL Architecture Notes

This document records the architecture, verification positioning, and collaboration guardrails for **ANVIL** across documentation, web assets, core TypeScript engines, and tests.

---

## 1. Product Positioning

**ANVIL — The Deterministic Verification Layer for AI Coding Agents**
> Any agent — Claude Code, Codex, Cursor, Antigravity, OpenCode — writes the code; ANVIL verifies it locally (blast radius, policy-as-code, secrets, tests) before it merges. Local-first, zero code sent to LLMs.

Key architectural principles:
- **Self-Contained Native Catalog:** ANVIL ships a compact, natively curated catalog under `catalog/` (`49` agents, `76` skills, `34` commands, `26` rule files) plus `51` workspace skills under `skills/` — eliminating third-party catalog bloat and external bridge dependencies.
- **Native Binary & Provenance Engine:** `src/core/binary-intelligence.ts` (`anvil binary`, MCP tool `anvil_binary_intelligence`) inspects binaries, WASM, source maps, databases, and captures locally with magic-byte classification and `ANVIL-BIN-001..003` provenance checks.
- **Upstream Attribution:** Maintains MIT attribution for foundational work in [FORGE / FORGE-ECC](https://github.com/ansh44233/FORGE-ECC) (`LICENSE`, `NOTICE`, `ACKNOWLEDGEMENTS.md`) while keeping ANVIL's codebase 100% native (`ANVIL_*` env vars, `.anvil/` state, `anvil_*` MCP tools).

---

## 2. Verified CLI Commands & Capabilities

Core verified commands (`npm run dev -- <cmd> --help`):
- `anvil gate` (`--baseline`, `--since`, `--policy`, `--sarif`)
- `anvil inspect` (`[path]`, `--detail`)
- `anvil map` (`--deep`)
- `anvil git` (`[base]`, `--detail`)
- `anvil binary` (`[path]`, `--findings-only`, `--json`)
- `anvil clean` (`--dry-run`, `--apply`, `--fix`, `--undo <backupId>`)
- `anvil doctor` (`--fix`)
- `anvil hook install` / `anvil hook remove`
- `anvil install` / `repair` / `uninstall` (`--target <agent>`, `--hooks`, `--profile`, `--with`)
- `anvil mcp setup` / `sync` / `catalog` / `add`
- `anvil agent-security` / `anvil shield`
- GitHub App handlers & automated PR comments (`src/github/`, `action.yml`)

---

## 3. Code & Test Maintenance Notes

1. **Case-Insensitive Hook Matching (`src/core/harness-hooks.ts` & `src/core/harness-installer/lifecycle.ts`):**
   Keep case-insensitive `/\banvil/i` matching when detecting or removing installed stop hook entries across Windows folder casing variations (e.g., `D:\\ANVIL\\dist\\cli.js`).
2. **Preserve User/Third-Party MCP Entries (`src/core/harness-installer/mcp-planner.ts`):**
   `anvil install` and `anvil uninstall` only manage the `"anvil"` key inside `.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, and other tool configs, never removing user-configured servers.
3. **Modularized Dashboard (`src/core/dashboard/`):**
   `src/core/dashboard-server.ts` delegates HTTP helpers, SSE, UI page/styles/script, and GET/POST handlers (`routes-get.ts`, `routes-post.ts`). `tests/dashboard-server.test.ts` binds an ephemeral HTTP server on `127.0.0.1:0` and requires loopback socket permissions when tested.
4. **Synchronization Test Requirement (`tests/readme-version-sync.test.ts`):**
   Keep `server.json` == `.well-known/mcp/server.json`, `llms.txt` == `public/llms.txt`, and all third-party GitHub Actions pinned to 40-char commit SHAs in `.github/workflows/*.yml`. Keep versions synchronized across `package.json`, `action.yml`, `CHANGELOG.md`, `README.md`, and `public/index.html`.
