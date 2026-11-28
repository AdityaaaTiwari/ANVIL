---
description: Build server-driven UI with htmx safely: fragments, swap targets, CSRF headers, OOB updates and errors
profile: standard
tags: htmx, html, frontend, backend
---

# htmx pages

Use when adding `hx-*` attributes, partial HTML endpoints, or out-of-band swaps to server-rendered pages.

## Fragments and swap hygiene
- Return semantic HTML fragments (not full `<html>` documents) for partial `hx-get` / `hx-post` requests unless `hx-boost` explicitly swaps `body` or `hx-select` scopes it. Check the `HX-Request` header when serving shared URLs.
- Always specify explicit `hx-target` and `hx-swap` (`innerHTML`, `outerHTML`, `beforeend`) so layout surprises do not wipe sibling controls.
- Use `hx-swap-oob="true"` sparingly with unique element IDs when updating secondary badges or counters alongside the primary target.

## Security and UX
- Configure CSRF protection cleanly once via `<body hx-headers='{"X-CSRF-Token": "..."}'>` or `htmx:configRequest` event listener instead of repeating hidden inputs on non-form triggers.
- Escape every dynamic user value in HTML templates; htmx inserts server responses straight into the DOM.
- Disable repeated clicks on mutations with `hx-disabled-elt="this"`, add `hx-indicator`, and return explicit HTTP `4xx` / `5xx` error fragments handled intentionally (`response-targets` or `htmx:responseError`).

## Verify
Tests checking both full-page `GET` and `HX-Request: true` partial responses, CSRF enforcement on mutations, XSS escaping in returned fragments, and history navigation (`hx-push-url`).
