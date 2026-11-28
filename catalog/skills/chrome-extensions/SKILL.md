---
description: Build Manifest V3 Chrome extensions securely: service workers, minimal permissions, messaging and storage
profile: standard
tags: chrome, extension, browser, security
---

# Chrome extensions (Manifest V3)

Use when building or updating browser extension manifests, background service workers, or content scripts.

## Manifest and least privilege
- Use `"manifest_version": 3`. Prefer `"activeTab"` + `"scripting"` triggered on user action over broad `<all_urls>` host permissions.
- Keep `"content_security_policy"` strict; never bundle remote scripts (`eval`, external JS URLs) or unpinned third-party libraries.

## Ephemeral service workers
- Background service workers terminate after idle timeouts. Never store session state in top-level JS variables; persist via `chrome.storage.local`, `chrome.storage.session`, or schedule work with `chrome.alarms`.
- Register all Chrome event listeners (`onInstalled`, `onMessage`, `onAlarm`) synchronously at top level so wakeup events never miss handlers.

## Messaging and content scripts
- Content scripts run alongside untrusted page DOM. Never trust `window.postMessage` events from pages without validating origin/format, and never pass sensitive tokens into page scripts.
- Validate `sender.id === chrome.runtime.id` and sender origin inside `chrome.runtime.onMessage` handlers; escape or use `textContent` before DOM updates.

## Verify
Validate `manifest.json`, test extension reload across worker termination/wakeup, check permissions warning in `chrome://extensions`, and run automated unit tests on message handlers.
