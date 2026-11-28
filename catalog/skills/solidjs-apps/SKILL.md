---
description: Write idiomatic SolidJS components: fine-grained signals, no prop destructuring, resources and cleanup
profile: standard
tags: solidjs, frontend, typescript, reactivity
---

# SolidJS apps

Use when writing SolidJS components, stores, primitives, or SolidStart routes.

## Reactivity rules (critical)
- **Never destructure component `props`** (`({ name }) => ...` breaks reactive tracking). Read `props.name`, or use `splitProps` / `mergeProps` when forwarding attributes or applying defaults.
- Compute derived state directly as closures (`const fullName = () => ...`) or `createMemo`, not by copying signals inside `createEffect`.
- Keep async reads in `createResource`, handling `<Show>`, `<Suspense>`, and `<ErrorBoundary>` states explicitly.

## Control flow and lists
- Use `<For each={items()}>` when list item references stay stable and data updates inside, or `<Index>` for lists of primitive inputs where index identity is stable. Avoid plain `.map(...)` inside JSX because it re-creates all DOM nodes on array updates.
- Register external listeners or timers inside `onMount` paired with `onCleanup` so scopes never leak on conditional unmount.

## Stores and SSR
Mutate nested stores using `setStore("users", (u) => u.id === id, "active", true)` path setters rather than cloning top-level objects needlessly; guard browser-only DOM calls inside `onMount` / `isServer`.

## Verify
Run Solid ESLint rules (`eslint-plugin-solid` catching destructured props), `tsc --noEmit`, Vite/Vinxi build, and component rendering tests.
