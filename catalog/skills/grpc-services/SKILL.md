---
description: Design and evolve gRPC and Protobuf services safely: schema compatibility, deadlines, errors and streaming
profile: standard
tags: grpc, protobuf, api, backend
---

# gRPC services

Use when authoring `.proto` contracts, implementing gRPC servers/clients, or configuring service-to-service RPCs.

## Schema evolution
- Never change a field's tag number or incompatible wire type once released; always add `reserved` for deleted field numbers and names.
- Wrap requests and responses in dedicated message types (`GetUserRequest`, `GetUserResponse`) even for one field so future additions stay non-breaking.
- Use explicit `optional` in `proto3` when distinguishing unset values from defaults (`0`, `""`, `false`) matters.

## Reliability and timeouts
- Attach a deadline on every outbound client RPC; propagate incoming context deadlines across downstream calls to prevent cascading hangs.
- Retry only idempotent methods (`WaitForReady` / service config) on `UNAVAILABLE`, never on `DEADLINE_EXCEEDED` or mutations without idempotency keys.
- Return canonical gRPC status codes (`INVALID_ARGUMENT`, `NOT_FOUND`, `PERMISSION_DENIED`, `FAILED_PRECONDITION`) rather than wrapping everything in `UNKNOWN` or `INTERNAL`.

## Security and streaming
- Enforce TLS/mTLS and validate per-RPC auth tokens in server interceptors, not inside every handler individually.
- Bound message sizes (`MaxRecvMsgSize`), configure HTTP/2 keepalives for long-lived streams, and propagate stream cancellation.

## Verify
Run `buf lint` / `buf breaking` (or `protoc`), unit tests for error code mapping and deadlines, and a streaming cancellation test.
