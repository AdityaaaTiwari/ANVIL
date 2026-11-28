---
description: Build Firebase apps securely: Firestore/RTDB security rules, Admin SDK isolation, App Check and batch limits
profile: standard
tags: firebase, firestore, auth, backend
---

# Firebase apps

Use when configuring Firebase client SDKs, Firestore/Storage security rules, Cloud Functions, or Firebase Auth.

## Security rules (non-negotiable)
- Never leave `allow read, write: if true;` or timestamped test-mode rules deployed. Deny all paths by default (`match /{document=**} { allow read, write: if false; }`) and grant per-collection access checking `request.auth != null` and ownership (`request.auth.uid == resource.data.ownerId`).
- Validate incoming document field types, required keys, and allowed state transitions inside `allow create` / `allow update` using `request.resource.data.keys().hasOnly([...])` so clients cannot inject admin fields like `role: "admin"`.
- Mirror strict size and `contentType` checks inside Firebase Storage rules.

## Client vs Admin SDK
- Client Firebase config (`apiKey`, `projectId`) is public identifier metadata — security lives in Security Rules + Auth + Firebase App Check.
- Never expose Service Account JSON or Admin SDK credentials to browser/mobile bundles; run privileged multi-user mutations via Cloud Functions or server backends checking verified ID tokens (`verifyIdToken(..., checkRevoked: true)`).

## Firestore scale and cost
Batch atomic mutations within the 500-operation `WriteBatch` limit, avoid hot monotonic keys on high write rates, and add composite indexes via `firestore.indexes.json`.

## Verify
Run security rules unit tests with Firebase Emulator Suite (`@firebase/rules-unit-testing`) asserting unauthorized reads/writes and injected fields fail.
