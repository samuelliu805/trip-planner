# Collaboration history and replay retention

`trip_history` is the durable audit log. Normal cleanup never deletes it.

`trip_operations`, `trip_creation_receipts`, and `trip_deletion_receipts` are replay-safety
records rather than audit history. Completed records remain replayable for 30 days, after which
the Global and CN cleanup jobs remove them through `cleanup_collaboration_replay_v1`. A retry
outside that window is treated as a new request and must use the entity's current version.

`trip_collaboration_storage_stats_v2` reports history rows and bytes, operation rows and result
bytes, receipt rows and bytes, and oldest/newest timestamps separately. The History page presents
those values as approximate database usage. It intentionally does not compare them with a vendor
plan or hard-code provider quota limits.
