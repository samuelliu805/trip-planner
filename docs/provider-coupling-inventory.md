# Provider coupling inventory

Inventory date: 2026-08-30. The scan excluded `node_modules`, `.next`, `supabase/.temp`, and the
untracked local credential dump named `grep`. The requested Supabase/provider search otherwise
covered application source, scripts, workflows, generated types, tests, and all migrations.

## Summary

- 63 Supabase migration files exist; Phase 1 changed none.
- 34 migrations contain explicit `auth.uid()`, `auth.users`, `storage.objects`, `service_role`, or
  Realtime coupling.
- Before the Phase 1 move, direct provider SDK imports existed in four Supabase factories and one
  maintenance script. Direct production SDK imports now live only in the four platform factories;
  the script is the sole legacy allowlist entry.
- 53 files still import a `src/lib/supabase` compatibility module after the trip-read slice moved.
- Coupling includes 15 Server Action files, 9 Route Handlers, 6 App Router Server Components, one
  direct browser Storage flow, repository/services, admin cleanup, SQL tests, and generated types.
- No application `.channel()`/Realtime subscription was found. Global capability remains true
  because Supabase provides it; CN capability is explicitly false. CN signed URL capability is true
  because CloudBase PG Storage supports it, while Phase 1 implementation status remains
  `storageImplemented: false` and `runtimeReady: false`.

Risk labels: **H** changes auth/security, multi-step storage, RPC transaction, RLS, or public snapshot
compatibility; **M** changes one or more provider queries but has a bounded domain surface; **L** is a
factory/telemetry read or a source-level compatibility check.

Planned phases use the backend-migration sequence: Phase 2 is schema baseline, overlays, deployment
tooling, and database security validation only; Phase 3 is Database repositories and Auth/session;
Phase 4 is Storage, cleanup jobs, and dual deployment workflow; Phase 5 is the Global/CN test
matrix, adversarial security testing, and rollout preparation.

## Browser/client

| File                                                       | Current purpose and coupling                                                                                   | Risk                                           | Planned phase                       |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------- |
| `src/lib/supabase/client.ts`                               | Compatibility re-export for the cookie-aware browser singleton.                                                | L                                              | 3–4, remove after consumers migrate |
| `src/features/sharing/components/use-long-image-export.ts` | Uploads/removes `share-images` directly with the browser Supabase Storage client.                              | H: signed upload lifecycle and failure cleanup | 4                                   |
| `src/features/attachments/upload-client.ts`                | No SDK import, but consumes Supabase signed PUT and TUS protocol fields and hard-codes `trip-assets` metadata. | H: resumability and storage protocol           | 4                                   |

## Server Components and server reads

| File                                      | Current purpose and coupling                                                                  | Risk                        | Planned phase    |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------- | ---------------- |
| `src/app/(auth)/login/page.tsx`           | Reads current Supabase user before redirecting.                                               | M: auth redirect            | 3                |
| `src/app/(auth)/signup/page.tsx`          | Reads current Supabase user before redirecting.                                               | M: auth/registration policy | 3                |
| `src/app/account/page.tsx`                | Reads user and `profiles`, including Supabase user metadata fallback.                         | H: identity/profile mapping | 3                |
| `src/app/home/page.tsx`                   | Reads optional current user for navigation and telemetry identity.                            | M                           | 3                |
| `src/app/trips/layout.tsx`                | Auth guard plus user email/telemetry identity.                                                | H: protected shell          | 3                |
| `src/app/trips/[tripId]/page.tsx`         | Reads current user to compute owner controls after repository reads.                          | H: owner authorization      | 3                |
| `src/features/research/compare-route.tsx` | Creates a server client and checks ownership while loading comparison state.                  | H                           | 3                |
| `src/features/i18n/server.ts`             | Reads user profile locale after `getUser()`, with cookie fallback.                            | M                           | 3                |
| `src/features/trips/data.ts`              | **Migrated:** composition-root `TripRepository` list/get slice; legacy result shape retained. | L                           | Phase 1 complete |

## Server Actions

| File                                           | Current purpose and coupling                                                                    | Risk                               | Planned phase    |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------- |
| `src/features/auth/actions.ts`                 | Password login/signup, Google OAuth, sign-out, redirects, and auth telemetry.                   | H: cookies/OAuth/error semantics   | 3                |
| `src/features/account/actions.ts`              | Authenticates and upserts `profiles`.                                                           | M                                  | 3                |
| `src/features/trips/actions.ts`                | Auth, profile default, `create_trip`, status/delete queries, telemetry, redirects, and cleanup. | H                                  | 3 then 4 cleanup |
| `src/features/trips/update-trip-action.ts`     | Auth plus transactional `update_trip_plan` RPC and revalidation.                                | H                                  | 3                |
| `src/features/itinerary/actions.ts`            | Clears/reorders variants and performs direct itinerary mutations.                               | H: order invariants                | 3                |
| `src/features/itinerary/day-actions.ts`        | Day insert/remove/reorder/copy RPC and table sequence.                                          | H: multi-write ordering            | 3                |
| `src/features/itinerary/item-create-action.ts` | Multi-step item/link/place creation with rollback and reorder.                                  | H                                  | 3                |
| `src/features/itinerary/item-delete-action.ts` | Owner-scoped item deletion and side effects.                                                    | H                                  | 3                |
| `src/features/attachments/actions.ts`          | Attachment share/detach RPC actions.                                                            | H: metadata/storage lifecycle      | 4                |
| `src/features/research/actions.ts`             | Research-item CRUD.                                                                             | M                                  | 3                |
| `src/features/research/plan-actions.ts`        | Apply/revert research plan RPCs and dependent reads.                                            | H: transactional projection        | 3                |
| `src/features/routes/actions.ts`               | Owner checks and saved route plan/calculation RPCs.                                             | H: legacy route JSON compatibility | 3                |
| `src/features/sharing/actions.ts`              | Create/update/revoke share-page RPCs.                                                           | H: public snapshot contract        | 3                |
| `src/features/sharing/long-image/actions.ts`   | Auth, long-image lifecycle RPCs, Storage removal, and revalidation.                             | H                                  | 4                |
| `src/features/variants/actions.ts`             | Route variant create/duplicate/update/primary/delete RPCs.                                      | H                                  | 3                |

## Route Handlers

| File                                                                                            | Current purpose and coupling                                                              | Risk                               | Planned phase |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------- | ------------- |
| `src/app/auth/callback/route.ts`                                                                | PKCE `exchangeCodeForSession`, auth telemetry, and redirect.                              | H: cookie/OAuth callback           | 3             |
| `src/app/api/trips/[tripId]/assets/[publicRef]/route.ts`                                        | Auth + owner asset RPC + signed Storage redirect.                                         | H                                  | 4             |
| `src/app/api/share/[token]/assets/[publicRef]/route.ts`                                         | Admin RPC authorizes public asset, then signs Storage URL.                                | H: public token and admin boundary | 4             |
| `src/app/api/trips/[tripId]/items/[itemId]/attachments/prepare/route.ts`                        | Auth, reservation RPC, signed upload(s), failure cleanup.                                 | H                                  | 4             |
| `src/app/api/trips/[tripId]/items/[itemId]/attachments/session/[sessionId]/route.ts`            | Auth plus commit/discard draft attachment session RPCs.                                   | H                                  | 4             |
| `src/app/api/trips/[tripId]/research/[researchItemId]/attachments/prepare/route.ts`             | Research attachment reservation and signed upload lifecycle.                              | H                                  | 4             |
| `src/app/api/trips/[tripId]/research/[researchItemId]/attachments/session/[sessionId]/route.ts` | Research attachment commit/discard session RPCs.                                          | H                                  | 4             |
| `src/app/share/image/[slug]/part/[part]/route.ts`                                               | Downloads a public share-image part from Supabase Storage.                                | H: public download/cache contract  | 4             |
| `src/app/api/cron/share-image-cleanup/route.ts`                                                 | `CRON_SECRET`, admin cleanup RPCs, Storage deletion, telemetry, and Vercel cron response. | H                                  | 4             |

The two attachment finalize `route.ts` files delegate their coupling to
`src/features/attachments/finalize-route.server.ts`; they contain validation and response routing but
no direct client creation.

## Middleware/proxy and factories

| File                              | Current purpose and coupling                                                              | Risk                 | Planned phase       |
| --------------------------------- | ----------------------------------------------------------------------------------------- | -------------------- | ------------------- |
| `src/proxy.ts`                    | Skips public share routes and delegates all other requests to the Supabase session proxy. | H: request-wide auth | 3                   |
| `src/lib/supabase/proxy.ts`       | Compatibility re-export only.                                                             | L                    | 3                   |
| `src/lib/supabase/server.ts`      | Compatibility re-export used by legacy Server Components/actions/handlers.                | L                    | 3–4 by consumer     |
| `src/lib/supabase/admin.ts`       | Compatibility re-export for privileged RPC/Storage work.                                  | H                    | 4                   |
| `src/lib/supabase/config.ts`      | Compatibility re-export for Supabase public URL/key validation.                           | L                    | 3–4                 |
| `src/platform/supabase/client.ts` | Approved `createBrowserClient` adapter, behavior moved unchanged.                         | L                    | Retained for Global |
| `src/platform/supabase/server.ts` | Approved cookie-backed `createServerClient` adapter.                                      | H                    | Retained for Global |
| `src/platform/supabase/proxy.ts`  | Approved request/response cookie refresh adapter using `getUser()`.                       | H                    | Retained for Global |
| `src/platform/supabase/admin.ts`  | Approved server-only SDK client; reads admin secret lazily.                               | H                    | Retained for Global |

## Repository/service coupling not yet migrated

| File                                                | Current purpose and coupling                                                                     | Risk | Planned phase |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---- | ------------- |
| `src/features/itinerary/data.ts`                    | Workspace variants, days, items, routes, places, links, and attachments across parallel queries. | H    | 3             |
| `src/features/itinerary/action-helpers.ts`          | Place snapshot RPC and itinerary link diff writes; accepts a Supabase client type.               | H    | 3             |
| `src/features/itinerary/item-action-validation.ts`  | Validates variant/day existence through direct queries.                                          | M    | 3             |
| `src/features/itinerary/item-telemetry.server.ts`   | Reads user only for telemetry attribution.                                                       | L    | 3             |
| `src/features/research/data.ts`                     | Research workspace tables and current-application RPC.                                           | H    | 3             |
| `src/features/research/action-helpers.ts`           | Shared research mutation helpers typed to the Supabase client.                                   | H    | 3             |
| `src/features/research/telemetry.server.ts`         | Reads user only for telemetry attribution.                                                       | L    | 3             |
| `src/features/variants/comparison-data.ts`          | Multi-table variant comparison projection.                                                       | H    | 3             |
| `src/features/variants/decision-summary-data.ts`    | Multi-table summary with route calculations.                                                     | H    | 3             |
| `src/features/variants/telemetry.server.ts`         | Reads user only for telemetry attribution.                                                       | L    | 3             |
| `src/features/routes/telemetry.server.ts`           | Reads user only for telemetry attribution.                                                       | L    | 3             |
| `src/features/sharing/data.ts`                      | Public/owner snapshot and share-image manifest RPCs plus schema parsing.                         | H    | 3             |
| `src/features/sharing/public-media-data.ts`         | Public itinerary RPC used to authorize place media.                                              | H    | 3             |
| `src/features/sharing/telemetry.server.ts`          | Reads user only for telemetry attribution.                                                       | L    | 3             |
| `src/features/attachments/storage.server.ts`        | Admin download, signed upload/access URL, and Supabase TUS origin derivation.                    | H    | 4             |
| `src/features/attachments/finalize-route.server.ts` | Auth, metadata reads, admin download/thumbnail upload/remove, finalize RPC/retry.                | H    | 4             |
| `src/features/attachments/cleanup.server.ts`        | Admin cleanup RPC queue and Storage deletes.                                                     | H    | 4             |
| `src/features/attachments/telemetry.server.ts`      | Reads user only for telemetry attribution.                                                       | L    | 3             |
| `src/features/trips/auto-title.ts`                  | Accepts a Supabase client and conditionally renames a default trip.                              | M    | 3             |

## Admin, cron, deployment, and scripts

| File                                                                              | Current purpose and coupling                                                                                           | Risk                               | Planned phase                             |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------- |
| `vercel.json`                                                                     | Schedules the existing Global cleanup endpoint daily.                                                                  | H: platform-specific scheduler     | 4; retain Global schedule                 |
| `.github/workflows/observability-ci.yml`                                          | Supplies Global placeholder env and runs build/test checks.                                                            | M                                  | Retained shared observability CI          |
| `.github/workflows/cloudbase-pg-ci.yml` + reusable `phase-5-dual-environment.yml` | Default-branch dispatch entry plus protected exact-SHA static, Global Preview/Supabase, and CN/CloudBase verification. | H: live non-production credentials | Phase 5; `run_mode=phase5`, `VERIFY` gate |
| `scripts/backfill-place-localities.ts`                                            | Direct admin Supabase SDK plus Google Places backfill. Exact lint allowlist entry.                                     | H: privileged bulk write           | 4                                         |

No production infrastructure, Vercel setting, Supabase project, or CloudBase resource was accessed or
modified during this inventory.

## Generated types

`src/types/database.ts` is a Supabase-generated Data API contract for `public` tables, enums, and
RPCs. TypeScript represents database UUID columns as `string`, but table/RPC names and generated
shapes are provider-specific. Global adapters may continue using it internally. Phase 3–4 domain
contracts must not expose it to CloudBase adapters; later generated CloudBase types belong inside
`src/platform/cloudbase` only. Phase 1 did not regenerate this file.

## Migrations

All 63 migrations remain the immutable Global Supabase history. The 34 explicitly coupled files are:

- `20260729160000_initial_schema.sql`
- `20260729190000_itinerary_reorder_and_profile_preferences.sql`
- `20260731134645_flexible_trip_dates_and_item_rules.sql`
- `20260802130101_add_manual_day_route_plans.sql`
- `20260803173303_route_variant_foundation.sql`
- `20260803183257_allow_previous_day_hotel_route_start.sql`
- `20260806125928_phase_6a_secure_public_sharing.sql`
- `20260807190815_activity_ssot_locality_backfill_and_day_order.sql`
- `20260810154805_phase_6b_plan_selection_apply_revert.sql`
- `20260810170830_apply_global_flight_to_unambiguous_plan.sql`
- `20260811041528_apply_structural_days_and_rentals.sql`
- `20260811080457_research_apply_v2_schedule_and_details.sql`
- `20260811084649_harden_research_journey_readiness.sql`
- `20260811151042_canonical_plan_prices_and_current_applications.sql`
- `20260811154500_normalize_legacy_flight_journeys_before_apply.sql`
- `20260811170608_apply_complete_booking_fields.sql`
- `20260811181150_distribute_stay_costs_and_capture_links.sql`
- `20260811190356_ensure_stay_apply_restores_checkout_day.sql`
- `20260812183629_public_share_themes_and_place_photos.sql`
- `20260814133837_public_template_architecture_v1.sql`
- `20260814175111_add_ethereal_and_journal_public_templates.sql`
- `20260815095627_share_pages_and_timeline_exports.sql`
- `20260815160556_long_image_date_range_scope.sql`
- `20260816011414_hard_delete_revoked_share_images.sql`
- `20260816015443_expire_share_images_after_thirty_days.sql`
- `20260816191530_add_traverse_public_template.sql`
- `20260817153403_phase_8a_item_attachments.sql`
- `20260817153531_phase_8a_attachment_rpcs.sql`
- `20260817153548_phase_8a_attachment_public_projection.sql`
- `20260817174500_phase_8a_attachment_retry_ordering.sql`
- `20260818005801_attachment_draft_sessions_and_orphan_cleanup.sql`
- `20260823120000_research_item_attachments_and_segment_carriers.sql`
- `20260823184500_add_neon_public_template.sql`
- `20260826060350_default_public_template_neon.sql`

They encode UUID auth ownership, `auth.uid()`, `auth.users`, RLS/security-definer RPC semantics,
Supabase Storage policies/objects, and `service_role` grants. They are not a portable CloudBase
baseline and must not be replayed blindly. Phase 2 must design a separate reviewed CloudBase PG
baseline rather than editing or bypassing this history. The abandoned AnalyticDB Supabase path and
`adbpg_enable_security_definer` limitation are not migration targets.

## Tests

- Supabase SQL tests under `supabase/tests/*.sql` create `auth.users`, exercise RLS/RPCs, and in
  attachment tests assert `service_role` privileges. Keep as Global regression coverage.
- `src/features/attachments/attachments.test.ts` asserts private/signed/resumable Storage and no
  public service-role exposure. Add CloudBase adapter coverage with implementation in Phase 4 and
  include it in the full adversarial matrix in Phase 5.
- itinerary, research, sharing, comparison, and decision-summary tests contain source/SQL assertions
  for current RPC and public snapshot behavior. Preserve them while moving one vertical slice at a
  time.
- `src/platform/platform.test.ts` now covers both legal matrices, mixed rejection, secret isolation,
  immutable capabilities, non-UUID user IDs, the fail-closed CN scaffold, and import boundaries.
