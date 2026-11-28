---
description: Use Drizzle ORM cleanly: typed schema tables, SQL migration inspection, prepared queries and serverless drivers
profile: standard
tags: drizzle, database, orm, typescript
---

# Drizzle ORM

Use when defining Drizzle schemas, generating migrations, or writing queries in TypeScript.

## Schema and migrations
- Keep table definitions, indexes, foreign keys, and constraints (`uniqueIndex`, `.notNull()`, `.references()`) together in schema files as the single source of truth.
- Run `drizzle-kit generate` to produce SQL migration files, review the SQL for table locks or unintended drops, commit migrations, and apply via `drizzle-kit migrate` or an explicit startup runner.
- Share inferred types (`typeof users.$inferSelect`, `typeof users.$inferInsert`) directly with validation schemas (`drizzle-zod`) instead of duplicating DTO interfaces.

## Queries and transactions
- Select only required columns (`db.select({ id: users.id, email: users.email })`) rather than `db.select()` when tables hold large blobs or sensitive hashes.
- Use `eq`, `and`, `inArray`, and `sql` tagged templates (never raw string concatenation) so all inputs remain parameterized.
- Wrap multi-step invariant writes in `db.transaction(async (tx) => ...)` and throw inside the callback to guarantee rollback.

## Drivers and performance
- Prepare hot-path queries with `.prepare(...)` where supported by long-lived servers; pick the HTTP/WebSocket driver (`neon-http`, `libsql`) intentionally for edge/serverless targets.

## Verify
Verify generated SQL diffs, run `tsc --noEmit`, and run integration tests covering constraints, typed joins, and transaction rollbacks.
