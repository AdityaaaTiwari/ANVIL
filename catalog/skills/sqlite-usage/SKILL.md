---
description: Use SQLite safely in production apps: WAL concurrency, pragmas, transactions, schema migrations and backups
profile: standard
tags: database, sqlite, backend, performance
---

# SQLite usage

Use when configuring SQLite connections, writing queries, or running SQLite in production.

## Connection pragmas
Set these on every connection open:
- `PRAGMA journal_mode = WAL;` for concurrent readers alongside a writer.
- `PRAGMA busy_timeout = 5000;` so brief lock contention retries instead of failing with `SQLITE_BUSY`.
- `PRAGMA foreign_keys = ON;` (disabled by default per connection) and `PRAGMA synchronous = NORMAL;` under WAL.

## Concurrency and transactions
- Allow only one writer connection (or queue writes in-process); open separate read connections or share one pooled handle for reads.
- Batch multi-row inserts and updates inside an explicit `BEGIN IMMEDIATE ... COMMIT` transaction. Outside a transaction, every statement flushes to disk.
- Keep write transactions short; never hold an open write transaction across network calls.

## Schema and queries
- Use `STRICT` tables (SQLite 3.37+) to enforce column types instead of silent type affinity coercion.
- Bind all parameters safely; inspect slow queries with `EXPLAIN QUERY PLAN` to catch `SCAN` vs `SEARCH`.

## Operations
Back up live WAL databases with `VACUUM INTO` or the online backup API, never by copying `.db` alone while `-wal` has uncheckpointed frames. Keep SQLite on local disk, not NFS/SMB.

## Verify
Integration tests covering concurrent reads during writes, foreign-key enforcement, migration idempotency, and a restore test from backup.
