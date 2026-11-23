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
- **Removed Unsubstantiated Claims**: Removed unbacked claims such as "10/10 production rating" from the website and docs, replacing them with concrete verified test metrics (561 automated tests passing across Node 22/24 on macOS, Ubuntu, and Windows).

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
- `anvil mcp setup` (with `--client <client>`)

Planned features are explicitly marked as "Coming soon":
- `anvil install --target <agent>`
- Agent-config security scan
- Cross-harness handoff
- GitHub App auto-commenting SaaS

---

## 4. Code & Test Observations for Your Attention

1. **Pre-commit Hook**:
   - `anvil hook install` and `anvil hook remove` are wired into `src/cli.ts` and `src/core/project-cleaner.ts`.
2. **Action PR Commenting**:
   - `scripts/post-pr-comment.cjs` supports the `pr-comment: "true"` option in `action.yml`.
3. **Synchronization Test Requirement**:
   - Remember that `tests/readme-version-sync.test.ts` enforces that `server.json` and `.well-known/mcp/server.json` must be identical, and `llms.txt` and `public/llms.txt` must be identical.
   - When bumping versions in `package.json`, keep these manifests in sync.
4. **Local Socket Test Environment**:
   - `tests/dashboard-server.test.ts` starts an ephemeral HTTP server on `127.0.0.1:0`. If running inside strict sandbox runners that disallow local port binding, ensure socket permissions or sandbox bypass are granted for that test suite.
