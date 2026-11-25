# Optional GitHub App Companion Endpoints

This directory contains optional serverless endpoints designed for teams choosing to deploy an optional, hosted companion for the **ANVIL GitHub App** (handling GitHub OAuth callbacks and GitHub App installation lifecycle events).

## Important: 100% Local-First Workbench Architecture

- **The core ANVIL CLI, local dashboard, MCP server, architecture engine, and verification harness are 100% local-first and offline-capable.**
- **ANVIL never requires this hosted companion to function.**
- When running `anvil` locally on your machine, zero code, AST symbols, or git history is transmitted to any cloud service.
- This directory is only utilized if you choose to deploy your own instance of the ANVIL GitHub App on Vercel to manage repository authorizations and team access.
