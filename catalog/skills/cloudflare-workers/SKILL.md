---
description: Build Cloudflare Workers and edge APIs: isolate lifecycle, bindings (KV/D1/R2), waitUntil and streaming
profile: standard
tags: cloudflare, edge, serverless, backend
---

# Cloudflare Workers

Use when building edge endpoints, middleware, or binding integrations (`KV`, `D1`, `R2`, `Queues`) on Cloudflare Workers.

## Isolate execution model
- Isolates stay warm across requests for multiple users: never store request-scoped auth, tenant state, or secret references in module-level mutable globals.
- Return the HTTP `Response` immediately and pass non-blocking background work (logging, analytics, cache writes) to `ctx.waitUntil(promise)` with `.catch(...)` error handling.
- Stream large request/response bodies directly via Web Streams (`TransformStream`, `response.body`) rather than buffering full files inside Worker memory limits.

## Bindings and configuration
- Access bindings exclusively via the typed `env` argument in `fetch(request, env, ctx)`; generate types with `wrangler types`.
- Remember `KV` is eventually consistent (avoid it for strict uniqueness/rate-limit counters—use Durable Objects instead); parameterize all `D1` SQL queries (`stmt.bind(...)`).
- Pin `compatibility_date` in `wrangler.jsonc` / `wrangler.toml`, and keep secrets in Wrangler secrets (`.dev.vars` locally, gitignored), never in plain `vars`.

## Verify
Run `wrangler types`, Vitest with `@cloudflare/vitest-pool-workers` (or Miniflare), and test streaming responses, `waitUntil`, and binding error paths under `wrangler dev`.
