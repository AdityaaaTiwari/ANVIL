---
description: Build reliable Apache Kafka producers and consumers: partition keys, delivery semantics, schemas and DLQs
profile: standard
tags: streaming, kafka, messaging, backend
---

# Kafka streaming

Use when designing topics, producers, or consumer groups with Kafka or compatible brokers.

## Topics and partitioning
- Pick partition keys by the entity whose strict ordering matters (e.g., `account_id`). Avoid hot keys that concentrate traffic onto a single partition.
- Over-partitioning consumes file handles and increases rebalance time; under-partitioning caps consumer parallelism. Plan partition count around peak throughput.
- Keep payloads bounded; pass object-storage pointers instead of multi-megabyte blobs.

## Producer reliability
- Enable idempotent writes (`enable.idempotence=true`, `acks=all`) and configure `delivery.timeout.ms` with retries so transient broker elections do not drop events.
- Enforce versioned schemas (`Avro` or `Protobuf` with `BACKWARD` compatibility) so consumers can roll out independently.

## Consumer correctness
- Commit offsets only after downstream persistence succeeds, not immediately upon polling.
- Separate processing loops or pause partitions if slow external calls risk exceeding `max.poll.interval.ms` and triggering rebalance storms.
- Route poison pills to a dead-letter topic (DLT) with error metadata and original headers after bounded retries; make consumers idempotent.

## Verify
Integration tests covering duplicate delivery (idempotency), poison-pill routing to DLT, consumer rebalance recovery, and schema backward compatibility.
