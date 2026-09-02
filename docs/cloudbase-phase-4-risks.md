# CloudBase Phase 4 risk register — closed implementation

Phase 4 is implemented and deployed to the approved CloudBase dev environment on master SHA
`6d483b930b844001f996032304abb7bc5cd77603`. The exact-SHA
[security workflow](https://github.com/samuelliu805/trip-planner/actions/runs/33542612599) and
[Deploy CN workflow](https://github.com/samuelliu805/trip-planner/actions/runs/33538930209) are the
authoritative automated evidence. Current runtime details and residue counts are recorded in
`docs/cloudbase-phase-4-runtime.md`.

## Closed risks

- **PG Storage readiness:** private `trip-assets` and `share-images` pgstore buckets exist; the
  legacy CloudBase bucket is not used as a PG Storage substitute.
- **Authorization surface:** asset metadata, upload/finalize, signed URLs, public media, retry, and
  scheduled cleanup are implemented. Owner/path RLS and service-role-only functions were exercised
  with users A and B plus anonymous requests.
- **Gateway/RPC compatibility:** the six-row application ledger records the reviewed storage and
  response-shape migrations. Live SDK tests cover the JSON-object and numeric cleanup envelopes.
- **Runtime availability:** CloudBase Run DeployId `006` is normal at 100% traffic; the final
  hostname returns exactly `{"status":"ok"}` and is registered as a safe domain.
- **Scheduled cleanup:** `trip-planner-cleanup` is Active/Available and
  `daily-storage-cleanup` is enabled with `0 17 3 * * * *`.
- **Controlled residue:** the closing audit reported zero CloudBase objects and Supabase
  `objects=0`, `assets=0`, `queues=0`, `temporary_users=0`.

## Open operational risks carried into Phase 5

| Risk                   | Current state                                                                                                                            | Required close condition                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| AMap capability        | Phase 4 closed fail-closed. The Phase 5 adapter is implemented; real UI/key smoke and Run runtime variable presence are not claimed yet. | Name-only Run runtime preflight plus provider-local isolation and protected real CN UI map/place/route/share smoke pass on one SHA.    |
| Logging and alerts     | CLS is enabled and cleanup-function log IDs exist; alert routing and a tested notification destination are not recorded.                 | Route actionable Run/function alerts to the named owner destination and record a test notification.                                    |
| Backup/restore         | The Personal plan has no database rollback capability and no disposable-target restore has been performed.                               | Upgrade to Standard+ or obtain a supported restore path, then complete the drill without touching current CN dev data.                 |
| Seed rollout           | Blocked on plan capability evidence.                                                                                                     | Confirm the shared plan exposes required logging/backup/support, or approve the plan upgrade/support action, before adding seed users. |
| Account exposure       | Controlled username/password accounts only.                                                                                              | Keep anonymous, phone, email, and public self-registration disabled unless a separately reviewed change authorizes them.               |
| Custom domain          | Not configured and not required for internal smoke.                                                                                      | ICP filing, certificate readiness, safe-domain update, rollback review, and explicit approval.                                         |
| Cross-region isolation | Global and CN must never exchange credentials, sessions, accounts, objects, or writes.                                                   | Phase 5 dual-environment adversarial tests and final zero-residue audits succeed on one exact commit.                                  |

The free/shared CloudBase plan still does not provide an unattended direct PostgreSQL migration
credential. This is an accepted operating constraint: use the authenticated, target-guarded
CloudBase migration surface and do not make `CLOUDBASE_PG_MIGRATION_URL` a prerequisite.
