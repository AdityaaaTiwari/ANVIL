---
description: Write secure Deno services: least-privilege permissions, deno.json tasks, JSR/npm specifiers and strict checks
profile: standard
tags: deno, typescript, runtime, security
---

# Deno runtime

Use when building scripts, CLIs, or HTTP servers with Deno.

## Least-privilege permissions
- Always scope runtime flags tightly (`--allow-net=api.example.com:443`, `--allow-read=./data`, `--allow-env=PORT`). Never ship `--allow-all` / `-A` in production entrypoints or Docker CMD.
- Pin permission sets per task in `deno.json` (`tasks` or `permission` sets in Deno 2) so developers and CI run identical bounds.

## Imports and lockfiles
- Manage dependencies cleanly in `deno.json` `"imports"` using pinned `jsr:` and `npm:` versions rather than bare remote URLs (`https://...`) scattered across files.
- Commit `deno.lock` and pass `--frozen` in CI to catch unexpected dependency tree changes.

## Server lifecycle and checks
- Use `Deno.serve({ port, signal }, handler)` and handle `SIGINT`/`SIGTERM` via `AbortController` to drain active requests gracefully.
- Clean up resources (`Deno.FsFile`, streams, timers) and enable `@std/testing` leak checks (`sanitizeResources`, `sanitizeOps`).

## Verify
Run `deno fmt --check`, `deno lint`, `deno check`, and `deno test` with minimal required permission flags.
