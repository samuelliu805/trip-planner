# CloudBase PG compatibility report — Phase 2

## Status and scope

Phase 2 is deployed to the disposable CN development target only. It establishes the CloudBase PG
schema/security baseline and controlled Auth test readiness. It does not add a CloudBase runtime
adapter, session integration, repository implementation, signup surface, Storage workflow, cleanup
job, CN deployment, data migration, synchronization, or dual write.

Target guard:

| Property         | Verified value                                  |
| ---------------- | ----------------------------------------------- |
| Env ID           | `trip-planner-cn-dev-d3bz94038b26`              |
| Region           | `ap-shanghai`                                   |
| PG instance ID   | `pgdb-l4lhtrv7`                                 |
| Database         | `pgdb-l4lhtrv7`                                 |
| DMC/current user | `cloudbase_postgres_pgdb_l4lhtrv7`              |
| Runtime mode     | `postgresql`                                    |
| Runtime backends | PostgreSQL `true`, NoSQL `false`, MySQL `false` |

No other CloudBase environment or PG instance was queried or modified. No Global Supabase or
Vercel resource was queried or modified.

## Capability probe

The read-only probe ran before any database write.

| Capability                     | Result                                                                    |
| ------------------------------ | ------------------------------------------------------------------------- |
| PostgreSQL                     | `17.11`                                                                   |
| Initially installed extensions | `plpgsql 1.0`                                                             |
| Available required extension   | `pgcrypto 1.3`                                                            |
| Auth helpers                   | `auth.uid()` → `text`; `auth.jwt()` → `jsonb`; both invoker               |
| Managed Auth ID                | `auth.users.id` is `bigint`                                               |
| Managed Storage owner ID       | `storage.objects.owner_id` is `text`                                      |
| API roles                      | `anon`, `authenticated`, `service_role` present                           |
| RLS bypass                     | `anon=false`, `authenticated=false`, `service_role=true`, DMC user `true` |
| Managed schemas                | `auth`, `storage`, `extensions`; `public` initially had no objects        |
| Initial business data          | no business tables or rows                                                |
| Initial controlled users       | administrator plus `trip-planner-cn-test-a` and `trip-planner-cn-test-b`  |
| Initial storage data           | zero buckets, zero objects                                                |
| Realtime                       | unsupported by this baseline; `realtime=false`                            |

CloudBase exposes business tables through the PG/PostgREST surface used by JS SDK v3 `app.rdb()`.
Current CloudBase RPC gateway behavior does not enforce PostgreSQL `GRANT EXECUTE` as a gateway
authorization boundary. Function grants are defense in depth only; every definer mutation must
validate CloudBase claims and business authorization internally.

## Source migration audit

The repository contains exactly 63 immutable SQL files under `supabase/migrations`, totaling 17,207
lines. The source-history scan found 27 `CREATE TABLE` statements, 180 function definitions, 65
policy definitions, 95 explicit index definitions, 8 enum definitions, 154 `SECURITY DEFINER`
occurrences, 119 `auth.uid()` calls, 8 direct `auth.users` references, and 11 `storage.objects`
references. Historical create/drop/replace operations resolve to the deployed final catalog below.

The generator preserved all 63 Supabase migration files unchanged. It emitted a reviewed business
history while omitting 388 statements that belong to Supabase/CloudBase managed Auth or Storage,
Supabase platform grants, or Phase 4 storage/cleanup behavior. It never runs `supabase db push` and
never restores `supabase_migrations`, Vault, Realtime, Supabase platform roles, `auth` tables, or
`storage` tables.

## Deployed catalog

Remote migration history contains:

| Version          | Name                           | Task/result                          |
| ---------------- | ------------------------------ | ------------------------------------ |
| `20260831030000` | `trip_planner_baseline`        | `task-738ca6fd`, `Succeed`, verified |
| `20260831031000` | `cloudbase_rpc_grants`         | `task-b554ec5d`, `Succeed`, verified |
| `20260831032000` | `cloudbase_security_hardening` | `task-1293320e`, `Succeed`, verified |

The first baseline attempt, `task-59c7f881`, failed on an obsolete fixed `create_trip` grant
signature. The transaction rolled back completely; the public catalog and remote migration history
were both verified empty before the corrected retry.

Final public catalog:

| Object                                | Count/result                |
| ------------------------------------- | --------------------------- |
| Business tables                       | 26                          |
| Project migration table               | 1 (`app_schema_migrations`) |
| Functions                             | 135                         |
| `SECURITY DEFINER` functions          | 109 after invoker hardening |
| Enums                                 | 7                           |
| Views/materialized views              | 0                           |
| Policies                              | 57                          |
| Triggers                              | 28                          |
| Indexes, including constraint indexes | 153                         |

All 27 public tables have both RLS enabled and forced. Anonymous has zero table privileges. All 12
active update policies have both `USING` and `WITH CHECK` expressions.

## Shared SQL and CloudBase overlays

- `database/shared/baseline.sql` is generated from the immutable business history.
- `database/cloudbase/overlays/identity.sql` owns CloudBase claim adaptation and project migration
  tracking.
- `database/cloudbase/overlays/security.sql` owns RLS forcing, API table grants, and the Phase 2
  guarded test RPC.
- `database/cloudbase/overlays/rpc-grants.sql` owns the current non-storage application RPC ACL.
- `database/cloudbase/overlays/security-hardening.sql` removes direct access to private tables and
  converts six helpers that do not require caller-independent privileges to invoker mode.
- `database/cloudbase/baseline.sql` and `cloudbase/migrations/20260831030000_...sql` are the checked
  single-file deployment artifact.

The CloudBase identity overlay exposes `app_current_user_id()` as an invoker function returning
`varchar(64)`. Shared policies and functions call that helper. The helper is the only maintained
place that calls CloudBase `auth.uid()` directly.

## UUID-to-text identity differences

Business UUIDs remain UUIDs. Only user identity values become `varchar(64)` and no CloudBase
business column has a foreign key to managed `auth.users`, because `auth.uid()` is text while
`auth.users.id` is bigint.

| Table                        | Column       | CloudBase type |
| ---------------------------- | ------------ | -------------- |
| `profiles`                   | `id`         | `varchar(64)`  |
| `trips`                      | `owner_id`   | `varchar(64)`  |
| `trip_members`               | `user_id`    | `varchar(64)`  |
| `public_itinerary_links`     | `created_by` | `varchar(64)`  |
| `research_plan_applications` | `applied_by` | `varchar(64)`  |
| `share_image_exports`        | `owner_id`   | `varchar(64)`  |
| `assets`                     | `owner_id`   | `varchar(64)`  |
| `asset_links`                | `owner_id`   | `varchar(64)`  |
| `asset_deletion_queue`       | `owner_id`   | `varchar(64)`  |

The 87 active functions whose definitions use `app_current_user_id()` are the complete function
identity adaptation inventory:

```text
app_current_user_id()
apply_research_item_to_variant(uuid,uuid,uuid)
apply_research_item_to_variant_phase_6b_p0(uuid,uuid,uuid)
apply_research_item_to_variant_v2_phase_6b_canonical_price(uuid,uuid,uuid,uuid,text)
apply_research_item_to_variant_v2_phase_6b_complete_fields(uuid,uuid,uuid,uuid,text)
apply_research_item_to_variant_v2_phase_6b_legacy_journey(uuid,uuid,uuid,uuid,text)
apply_research_item_to_variant_v2_phase_6b_nightly_costs(uuid,uuid,uuid,uuid,text)
apply_research_item_to_variant_v2_phase_6b_p05(uuid,uuid,uuid,uuid,text)
apply_research_item_to_variant_v2_phase_6b_schedule(uuid,uuid,uuid,uuid,text)
apply_research_item_to_variant_v2_phase_attachment_transfer(uuid,uuid,uuid,uuid,text)
apply_selected_research_item(uuid,uuid,uuid)
clear_day_route_plan(uuid,uuid)
clear_research_item_selection(uuid,uuid,uuid)
clear_route_variant_items(uuid,uuid,uuid[])
commit_item_asset_session_v1(uuid,uuid,uuid)
commit_research_asset_session_v1(uuid,uuid,uuid)
copy_research_assets_to_items_v1(uuid,uuid,uuid,uuid[])
create_public_itinerary_link(uuid,public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,text,text)
create_public_itinerary_link_v2(uuid,public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text)
create_public_itinerary_link_v3(uuid,public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,integer)
create_public_itinerary_link_v4(uuid,public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,integer)
create_route_variant(uuid,uuid,text,text)
create_share_page_v1(uuid,public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,integer,boolean,text,uuid)
create_share_page_v2(uuid,public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,integer,boolean,text,uuid,integer,integer)
create_share_page_v3(uuid,public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,integer,boolean,text,uuid,integer,integer,boolean)
create_trip(text,date,date,text,text,integer)
current_research_plan_application_ids(uuid,uuid)
delete_route_variant(uuid,uuid)
detach_item_asset_v1(uuid,uuid,text)
detach_research_asset_v1(uuid,uuid,text)
discard_item_asset_session_v1(uuid,uuid,uuid)
discard_research_asset_session_v1(uuid,uuid,uuid)
duplicate_route_variant(uuid,uuid,text,text)
fail_item_asset_v1(uuid,text)
fail_share_image_version_v1(uuid,text)
finalize_item_asset_v1(uuid,text,bigint,asset_media_kind,text,integer,integer,numeric,boolean)
finalize_research_asset_v1(uuid,text,bigint,asset_media_kind,text,integer,integer,numeric,boolean)
insert_variant_day(uuid,uuid,integer)
is_trip_member(uuid)
is_trip_owner(uuid)
list_public_itinerary_links(uuid)
list_public_itinerary_links_v2(uuid)
list_public_itinerary_links_v3(uuid)
list_share_pages_v1(uuid)
list_share_pages_v2(uuid)
owner_asset_access_v1(uuid,text)
owner_share_image_export_paths_v1(uuid)
owner_share_page_by_token_v1(uuid)
owner_share_page_by_token_v2(uuid)
owner_share_page_image_state_v1(uuid)
owner_share_page_v1(uuid)
owner_share_page_v2(uuid)
phase2_rename_owned_trip(uuid,text)
prepare_item_asset_v1(uuid,uuid,text,text,bigint,asset_media_kind,text)
prepare_item_asset_v2(uuid,uuid,text,text,bigint,asset_media_kind,text)
prepare_item_asset_v3(uuid,uuid,text,text,bigint,asset_media_kind,text,uuid)
prepare_research_asset_v1(uuid,uuid,text,text,bigint,asset_media_kind,text,uuid)
prepare_share_image_version_v1(uuid,text,uuid,text,text,jsonb)
prepare_share_image_version_v2(uuid,text,uuid,text,text,jsonb)
remove_variant_day(uuid,uuid,uuid)
reorder_variant_days(uuid,uuid,uuid[])
revert_research_plan_application_phase_6b_complete_price(uuid,uuid)
revert_research_plan_application_phase_6b_p0(uuid,uuid)
revert_research_plan_application_phase_6b_p05(uuid,uuid)
revert_research_plan_application_phase_6b_schedule(uuid,uuid)
revert_research_plan_application_phase_attachment_transfer(uuid,uuid)
revoke_public_itinerary_link(uuid)
revoke_share_image_export_v1(uuid)
revoke_share_page_v1(uuid)
rotate_public_itinerary_link(uuid)
rotate_public_itinerary_link_v2(uuid)
rotate_public_itinerary_link_v3(uuid)
save_day_route_calculation(uuid,text,jsonb,integer,integer,text)
save_day_route_plan(uuid,uuid,uuid[],text[])
select_research_item_for_variant(uuid,uuid,uuid)
select_research_item_for_variant_phase_6b_p05(uuid,uuid,uuid)
set_item_asset_share_v1(uuid,uuid,text,boolean)
set_item_asset_share_v2(uuid,uuid,text,boolean)
set_primary_route_variant(uuid,uuid)
update_public_itinerary_link(uuid,public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,text,text)
update_public_itinerary_link_v2(uuid,public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text)
update_public_itinerary_link_v3(uuid,public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,integer)
update_public_itinerary_link_v4(uuid,public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,integer)
update_route_variant_metadata(uuid,uuid,text,text)
update_share_page_v1(uuid,public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,integer,boolean,text,uuid)
update_share_page_v2(uuid,public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,integer,boolean,text,uuid,integer,integer)
update_share_page_v3(uuid,public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,integer,boolean,text,uuid,integer,integer,boolean)
```

Function parameters that represent business objects, trips, variants, items, plans, shares, or assets
remain UUID. No RPC accepts a caller-supplied user/owner identity as authority.

## Extensions

`pgcrypto 1.3` is available on the CloudBase PG 17 instance and is installed by the baseline into
the existing `extensions` schema because public snapshot hashes use `extensions.digest`. Built-in
`gen_random_uuid()` was also catalog-verified. No other extension is installed by Phase 2.

## Managed Auth and Storage boundary

The baseline never creates, alters, grants on, or writes to CloudBase managed `auth` or `storage`
tables. It reads `auth.uid()` only through the identity helper. It does not add an Auth trigger to
`auth.users`; profile creation remains a Phase 3 adapter responsibility. Asset metadata tables stay
in the business schema, while buckets, objects, object policies, signed URLs, cleanup, and scheduled
deletion remain Phase 4.

After all tests, managed state was unchanged: three Auth users remain, and Storage still has zero
buckets and zero objects. Business tables contain zero trips, members, profiles, or share links.

## SECURITY DEFINER audit

| Category                          | Result                                       |
| --------------------------------- | -------------------------------------------- |
| Definer functions                 | 109                                          |
| Fixed empty `search_path`         | 109/109                                      |
| Anon-executable definers          | 2 current public snapshot RPCs               |
| Authenticated-executable definers | 29 current application/security RPCs         |
| No client EXECUTE ACL             | verified by the post-hardening catalog check |
| Phase 4 service-role cleanup RPCs | omitted from baseline                        |

The two anonymous RPCs are `get_public_itinerary_v4(uuid)` and
`get_public_share_page_v3(uuid)`. They return published snapshot projections only. The guarded
`phase2_rename_owned_trip(uuid,text)` RPC proves that definer execution re-checks the caller and trip
ownership instead of trusting a parameter or relying on grants.

## RLS and Auth test evidence

Provider state after testing:

- username/password login is enabled;
- email, phone, and anonymous login are disabled;
- `trip-planner-cn-test-a` and `trip-planner-cn-test-b` exist as admin-created controlled users;
- no signup UI/API was added;
- `backendCapabilitiesByRegion.cn.selfRegistration` remains `false`;
- test passwords remain only in `.env.local`/the user's password manager;
- a publishable key was created for the controlled live SDK test and was not printed or committed.

SQL/session-claim verification used the two real CloudBase user IDs, switched to the
`authenticated` and `anon` database roles, and rolled the complete test transaction back. Live JWT
verification used temporary `@cloudbase/js-sdk 3.9.0`, real password logins, and the same two
controlled rows; those rows were deleted immediately afterward.

| Assertion                     | SQL/session claims          | Live JWT                                   |
| ----------------------------- | --------------------------- | ------------------------------------------ |
| A reads own trip              | pass                        | pass                                       |
| A reads B trip                | denied/zero rows            | denied/zero rows                           |
| A updates B trip              | denied/zero rows            | denied/zero rows                           |
| A deletes B trip              | denied/zero rows            | denied/zero rows                           |
| A forges `owner_id`           | `WITH CHECK` denied         | denied                                     |
| A calls definer RPC against B | internal owner check denied | SQL-level coverage; no guessed raw RPC URL |
| Valid owner update            | pass                        | pass                                       |
| Anonymous private table read  | denied                      | denied after sign-out                      |
| Valid public snapshot token   | expected snapshot only      | SQL-level coverage                         |
| Unknown public token          | unavailable                 | SQL-level coverage                         |

The documented explicit-instance raw REST route returned `404`; the test stopped using that path
instead of guessing a variant and switched to the official JS SDK, as required by the PG skill.
Phase 3 must verify the final application session/RPC composition again when its actual adapter is
implemented.

## Fresh deployment and verification

1. Put only the three non-secret target identifiers in `.env.local` and keep all existing variables.
2. Run `npm run build:cloudbase-pg-baseline` and `npm run check:cloudbase-pg-baseline`.
3. Device-login through the CloudBase plugin, call `auth(set_env)` with the exact Env ID, and rerun
   `envQuery(info)` plus the read-only PG context/database/user probe.
4. Confirm the environment is approved and contains no business data.
5. Plan and apply the three files in `cloudbase/migrations` in version order with
   `managePgDatabase(planMigration/applyMigration)`, explicitly passing the Env ID and
   `pgdb-l4lhtrv7` on every call.
6. Run the SQL in `database/cloudbase/verify/catalog.sql` and `security.sql`, then the controlled
   session-claim/live-JWT matrix.

The tooling prints only Env ID, Region, PG instance ID, and database. It does not require or inspect
a direct PostgreSQL URL, password, token, or Global credential.

## Rollback, backup, and recreation

These migrations are fresh-environment baselines. Do not run a destructive rollback after business
data exists. Before a later migration, use whatever snapshot/export facility the CloudBase plan
actually exposes and verify restoration in a separate approved environment; the free shared PG
instance did not expose a direct unattended backup/migration credential during this phase.

For this disposable development environment while it is still business-empty, the safe rollback is
to create/recreate an approved fresh CloudBase PG environment and reapply the last known-good
versioned migration set. A SQL rollback must be separately reviewed, explicitly target the same Env
ID and instance ID, and enumerate every object; no broad `DROP SCHEMA ... CASCADE` rollback is
checked in.

## Remaining risks and blockers

- Phase 3 must implement and retest the real CloudBase Auth/session and repository adapters.
- CloudBase's RPC gateway does not enforce `GRANT EXECUTE`; internal authorization remains
  mandatory and every newly exposed definer RPC needs the same audit.
- The baseline retains legacy/transition functions for schema equivalence; 85 are intentionally not
  in the client ACL and should be pruned only in a separately reviewed migration.
- Storage metadata exists but Storage behavior, policies, buckets, signed URLs, cleanup, and jobs are
  Phase 4 only.
- Realtime remains `false`; no fake replacement exists.
- **免费实例无法提供无人值守直连 migration credential**. Phase 2 therefore uses authenticated
  CloudBase plugin migrations and does not require `CLOUDBASE_PG_MIGRATION_URL`.

See [CloudBase Phase 4 risks](cloudbase-phase-4-risks.md) for the storage/deployment implications.
