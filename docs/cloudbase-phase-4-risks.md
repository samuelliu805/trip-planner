# CloudBase Phase 4 risks

Phase 4 has not started. The following items are explicit rollout risks, not implemented features.

- **免费实例无法提供无人值守直连 migration credential**. Do not make a direct PostgreSQL URL,
  password reset, migration account, or `CLOUDBASE_PG_MIGRATION_URL` a prerequisite. Use the
  authenticated CloudBase plugin migration surface with exact Env/instance guards; DMC is only a
  manual fallback when MCP is unavailable.
- The existing legacy CloudBase bucket is not a PG Storage bucket. Phase 4 must create and verify an
  explicit pgstore bucket before browser upload code is enabled.
- CloudBase managed `storage.buckets` and `storage.objects` must not be restored from Supabase or
  directly deleted. Bucket/object authorization must use CloudBase PG Storage's managed schema,
  RLS, and Storage API.
- Asset metadata exists in `public`, but upload, finalize, signed URL, public media, cleanup retry,
  orphan cleanup, and scheduled deletion behavior are intentionally absent.
- Service-role and cleanup RPC grants are intentionally absent. The pinned SDK probe confirms the
  gateway enforces `GRANT EXECUTE`, but Phase 4 still needs an authenticated server boundary plus
  internal role/ownership checks for each privileged operation.
- CloudBase JS SDK 3.9.0 currently attempts to JSON-parse RPCs that return a scalar UUID. Phase 4
  must verify every asset/share-image RPC response shape through the real SDK rather than assuming
  PostgreSQL scalar results compose correctly.
- Backup/restore capability must be proven for the actual CloudBase plan before any environment
  with business data is migrated. Fresh-environment recreation is the current safe recovery path.
- Global and CN Storage must remain isolated. No attachment, object, session, account, or token may
  be copied, synchronized, or dual-written without a separately approved migration plan.
