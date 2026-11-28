---
description: Embed DuckDB safely for fast analytics: Parquet/CSV scans, memory/thread bounds, read-only modes and concurrency
profile: standard
tags: duckdb, analytics, parquet, data
---

# DuckDB analytics

Use when running embedded analytical queries over Parquet, CSV, JSON, or local `.duckdb` files.

## External files and performance
- Query partitioned Parquet/JSON directly (`read_parquet('data/dt=*/*.parquet', hive_partitioning = true)`) with column projection and `WHERE` pushdowns so DuckDB reads only needed row groups and columns.
- Avoid `SELECT *` in production analytics; list needed columns explicitly to keep vectorized memory footprints low.
- Persist expensive cleaned outputs directly via `COPY (...) TO 'out.parquet' (FORMAT PARQUET, COMPRESSION ZSTD)` instead of materializing huge DataFrames in host language memory.

## Concurrency and resource bounds
- DuckDB supports single-writer OR multiple read-only processes on a `.duckdb` file, not concurrent read+write across separate OS processes. Open shared files with `access_mode = 'READ_ONLY'` for readers.
- Always configure `SET memory_limit = '2GB';` and `SET threads = 4;` (and `SET temp_directory = ...` if spilling) in shared backend services so one analytical query cannot OOM the host process.

## Parameter safety
Always use prepared statement parameters (`$1` / `?`) for filter values, and never interpolate untrusted user strings into SQL or `read_parquet(...)` paths; restrict external access with `enable_external_access = false` when running user-supplied SQL.

## Verify
Check `EXPLAIN ANALYZE` for Parquet predicate/projection pushdown, confirm `memory_limit` behavior on large inputs, and test concurrent read-only access or parameterized filtering.
