# Privacy Policy — ANVIL Engineering Workbench

Effective Date: November 2026
Maintainer: Aditya Tiwari ([m.g.atiwari28@gmail.com](mailto:m.g.atiwari28@gmail.com))
Repository: [https://github.com/AdityaaaTiwari/ANVIL](https://github.com/AdityaaaTiwari/ANVIL)

---

## 1. Local-First CLI & MCP Server (`anvil` / `anvil mcp start`)

- **Zero Telemetry & Offline-First:** The ANVIL CLI, static security scanner (`anvil shield`), quality gate (`anvil gate`), binary analyzer (`anvil binary`), and read-only Model Context Protocol (MCP) server operate **100% locally** on your machine.
- **No Code Exfiltration:** Your repository source code, AST symbols, git history, memory notes, and secrets are **never** uploaded to ANVIL servers or any third-party analytics service when using CLI or MCP tools (`openWorldHint: false`).
- **Built-in Secret Guardrails:** `anvil_list_files`, `anvil_search_code`, and `anvil_read_file` block access to `.env`, private keys, credentials, `node_modules`, and files outside the configured workspace root.
- **Optional BYOK AI Commands:** Commands that explicitly invoke a user-configured LLM provider (such as `anvil run` or `anvil review --ai`) send prompts only to the provider endpoint configured by you using your own API key. Read-only MCP tools never invoke external AI APIs.

---

## 2. Optional Hosted GitHub App & Control Center (`anvil-virid-sigma.vercel.app`)

Using the hosted GitHub App companion is **strictly optional** and never required for local CLI or MCP usage. When you explicitly authorize the GitHub App:

- **Authentication & Sessions:** GitHub OAuth with PKCE is used to verify your GitHub login and repository installation access. Encrypted short-lived session records (8-hour TTL) are stored in Upstash Redis using `HttpOnly`, `Secure`, `SameSite=Lax` cookies.
- **Repository Data Access:** Installation tokens are minted only for repositories you grant access to, strictly using the permissions you approve (`Metadata`, `Contents`, `Pull requests`, and optionally `Issues` / `Checks`). Pull request risk, Shield audits, and event history are processed statelessly without persisting source files.
- **Public Verification Badges (`/api/app?op=badge`):** Badge summaries (Shield score / Readiness score) are only served for **public** repositories. Private repositories never expose scores, grades, or repository metadata publicly.

---

## 3. Data Retention & Deletion

- **Local Workspace Data:** All `.anvil/` artifacts stay on your local disk; delete `.anvil/` or run `anvil uninstall` at any time.
- **Hosted Data:** Sign out in the Control Center (`/api/github/logout`) to revoke your session immediately, or uninstall the ANVIL GitHub App in your GitHub Settings to delete installation metadata via webhook.
- **Contact:** Questions or deletion requests can be sent to **[m.g.atiwari28@gmail.com](mailto:m.g.atiwari28@gmail.com)**.
