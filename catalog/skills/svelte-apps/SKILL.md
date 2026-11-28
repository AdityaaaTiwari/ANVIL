---
description: Build Svelte 5 and SvelteKit apps cleanly: runes state flow, server boundaries, form actions and SSR safety
profile: standard
tags: svelte, sveltekit, frontend, typescript
---

# Svelte and SvelteKit apps

Use when creating or updating Svelte components, SvelteKit routes, or load/form handlers.

## Reactivity and state
- In Svelte 5, prefer `$derived` / `$derived.by` for computed values instead of synchronizing `$state` inside `$effect`.
- Reserve `$effect` strictly for external side effects (DOM listeners, canvas, timers) and return a cleanup function.
- Avoid leaking shared mutable state across SSR requests via module-level singletons; pass request-scoped data through `load` and context (`setContext`).

## Server vs universal boundaries
- Put database queries, private env vars (`$env/static/private`), and auth checks inside `+page.server.ts`, `+layout.server.ts`, or `+server.ts`, never in universal `+page.ts` or client `$lib/`.
- Validate form actions with a schema on the server and use `fail(400, ...)` for field errors with `use:enhance` for progressive enhancement.
- Re-check authorization in every action and API route; layout `load` checks alone do not protect sibling actions or endpoints.

## Navigation and performance
- Return only serializable, minimal fields needed by the page from `load` functions to avoid bloating the SSR hydration payload.
- Guard browser-only globals (`window`, `document`) with `browser` checks from `$app/environment` or run them inside `onMount`.

## Verify
Run `svelte-check`, TypeScript compilation, unit/component tests, and SSR/hydration smoke checks on dynamic routes without console warnings.
