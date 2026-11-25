# Notes for Claude (Parallel Agent Collaboration)

Hi Claude! Antigravity here. This document records the documentation, website, and positioning work done on the `antigravity/docs-and-site` branch to ensure seamless parallel collaboration without merge conflicts.

---

## 1. Scope & Boundaries Respected

As agreed:
- **Files Antigravity edited:** `README.md`, `public/index.html`, `public/llms.txt`, `llms.txt`, `server.json`, `.well-known/mcp/server.json`, `smithery.yaml`, `CHANGELOG.md`, `docs/`.
- **Files untouched by Antigravity:** `src/`, `tests/`, `api/`, `scripts/`, `package.json`, `package-lock.json`, `action.yml`, `tsconfig.json`, `vitest.config.ts`, `AGENTS.md`.

---

## 2. Product Positioning

ANVIL has been clearly repositioned across all documentation, manifests, and the landing page as:
> **The Deterministic Verification Layer for AI Coding Agents**
> Any agent — Claude Code, Codex, Cursor, Antigravity, OpenCode — writes the code; ANVIL checks it locally (blast radius, policy-as-code, secrets, tests) before it merges. Local-first, zero code sent to LLMs.

Key relationship distinctions:
- **Complements ECC (`affaan-m/ECC`)**: ECC provides agent content/skills; ANVIL provides the local verification layer and policy gate.
- **Upstream Credit**: Acknowledges origin fork of FORGE-ECC (`ansh44233/FORGE-ECC` by Ansh), while eliminating copycat text and establishing ANVIL's unique deterministic verification identity.
- **Removed Unsubstantiated Claims**: Removed unbacked claims such as "10/10 production rating" from the website and docs, replacing them with concrete verified test metrics (`681` Vitest tests across `102` suites plus `103` Python REA bridge tests across `10` suites passing across Node 22/24 and Python 3 on macOS, Ubuntu, and Windows).

---

## 3. Verified CLI Commands & Documentation

Every command documented in `README.md` and `docs/getting-started.md` was verified by running `npm run dev -- <cmd> --help`.
- `anvil gate` (with `--baseline`, `--since`, `--policy`, `--sarif`)
- `anvil inspect` (with `[path]`, `--detail`)
- `anvil map` (with `--deep`)
- `anvil git` (with `[base]`, `--detail`)
- `anvil clean` (with `--dry-run`, `--fix`, `--undo <backupId>`)
- `anvil doctor` (with `--fix`)
- `anvil hook install` and `anvil hook remove`
- `anvil mcp setup`

Implemented capabilities:
- `anvil install --target <agent>` (modularized under `src/core/harness-installer/`)
- Agent-config security scan (`anvil agent-security`, `anvil shield`)
- GitHub App handlers & automated PR comments (`src/github/`, `action.yml`)

---

## 4. Code & Test Observations for Your Attention

1. **Case-Insensitive Hook Matching (`src/core/harness-hooks.ts` & `src/core/harness-installer/lifecycle.ts`)**:
   During Windows live testing with `anvil install . --hooks --server local --target claude,cursor`, the command written into settings was:
   `node "D:\\ANVIL\\dist\\cli.js" hook stop --harness claude`
   Keep case-insensitive `/\banvil/i` matching when detecting or removing installed hook entries across Windows folder casing variations.

2. **Multi-MCP Coexistence (`anvil install` + `rea`)**:
   Users frequently pair ANVIL with reverse-engineering MCP servers like `morluto/rea` (`npx rea-agents setup`). `mcp-planner.ts` in `src/core/harness-installer/` cleanly respects foreign MCP server entries in `.mcp.json` and `.cursor/mcp.json`. Keep ensuring `anvil uninstall` only deletes the `"anvil"` entry and never removes user-added or third-party servers.
   Also run `npm run test:rea` to verify the Python REA bridge suite under `catalog/rea/bridges/`.

3. **Modularized Dashboard (`src/core/dashboard/`)**:
   `src/core/dashboard-server.ts` delegates HTTP helpers, SSE, UI page/styles/script, and GET/POST handlers to `src/core/dashboard/*`.
   - `tests/dashboard-server.test.ts` starts an ephemeral HTTP server on `127.0.0.1:0`. If running inside strict sandbox runners that disallow local port binding, ensure socket permissions or sandbox bypass are granted for that test suite.
4. **Synchronization Test Requirement**:
   - Remember that `tests/readme-version-sync.test.ts` enforces that `server.json` and `.well-known/mcp/server.json` must be identical, `llms.txt` and `public/llms.txt` must be identical, and every third-party GitHub Action in `.github/workflows/*.yml` must use a pinned 40-char SHA.
   - When bumping versions in `package.json`, keep these manifests in sync.
