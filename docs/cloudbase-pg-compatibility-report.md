# CloudBase PG compatibility report — Phase 2

## Outcome and scope

Phase 2 is deployed only to the disposable CN development target. It establishes the CloudBase PG
schema, RLS, RPC boundary, controlled A/B identities, deterministic migration artifacts, and
repeatable security verification. It does not add the Phase 3 runtime adapter, public registration,
Storage, Realtime, data migration, synchronization, dual write, or a CN application deployment.

| Property         | Verified value                                  |
| ---------------- | ----------------------------------------------- |
| Env ID           | `trip-planner-cn-dev-d3bz94038b26`              |
| Region           | `ap-shanghai`                                   |
| PG instance ID   | `pgdb-l4lhtrv7`                                 |
| Database         | `pgdb-l4lhtrv7`                                 |
| DMC/current user | `cloudbase_postgres_pgdb_l4lhtrv7`              |
| Runtime mode     | `postgresql`                                    |
| Runtime backends | PostgreSQL `true`, NoSQL `false`, MySQL `false` |

No other CloudBase environment or instance was queried or modified. No Global Supabase or Vercel
resource was queried or modified.

## Bootstrap and future migrations

The existing 63 `supabase/migrations/*.sql` files remain byte-for-byte unchanged. Their ordered
filenames and SHA-256 hashes are frozen in `database/cloudbase/bootstrap-manifest.json`.
`check:cloudbase-pg-baseline` regenerates the expected content in memory and byte-compares:

- `database/shared/baseline.sql`;
- `database/cloudbase/baseline.sql`;
- `cloudbase/migrations/20260831030000_trip_planner_baseline.sql`;
- the RPC-grant overlay against migration `20260831031000`;
- the security-hardening overlay against migration `20260831032000`.

Static verification does not read `.env.local`. Deployment target validation is a separate command.
Migration 64+ uses a provider-neutral source plus minimal provider overlays and generated Supabase
and CloudBase artifacts; it never regenerates the deployed bootstrap. See
`docs/cloudbase-pg-migration-process.md`.

Remote migration history:

| Version          | Name                               | Result                   |
| ---------------- | ---------------------------------- | ------------------------ |
| `20260831030000` | `trip_planner_baseline`            | applied and verified     |
| `20260831031000` | `cloudbase_rpc_grants`             | applied and verified     |
| `20260831032000` | `cloudbase_security_hardening`     | applied and verified     |
| `20260831040000` | `cloudbase_rpc_boundary_hardening` | `task-5aaa8899`, Succeed |

The final migration had no schema/data conflict in `planMigration`, was the only pending version,
and was applied with both Env ID and instance ID explicit. It removed
`phase2_rename_owned_trip(uuid,text)`, moved three internal helpers to `app_private`, rewrote their
qualified references, and reapplied the exact external allowlist.

## Identity and managed-schema compatibility

CloudBase `auth.uid()` returns `text`; managed `auth.users.id` is `bigint`. User ownership columns
therefore use `varchar(64)`, while Trip/Variant/Item/share business identifiers remain UUIDs:

| Table                        | Column       |
| ---------------------------- | ------------ |
| `profiles`                   | `id`         |
| `trips`                      | `owner_id`   |
| `trip_members`               | `user_id`    |
| `public_itinerary_links`     | `created_by` |
| `research_plan_applications` | `applied_by` |
| `share_image_exports`        | `owner_id`   |
| `assets`                     | `owner_id`   |
| `asset_links`                | `owner_id`   |
| `asset_deletion_queue`       | `owner_id`   |

`app_private.app_current_user_id()` is the only maintained direct call to `auth.uid()`.
`app_private.is_trip_member(uuid)` and `app_private.variant_trip_id(uuid)` are also outside the
exposed `public` RPC schema. Static migration checks fail if project SQL creates, alters, grants on,
or writes to CloudBase-managed `auth` or `storage` schemas.

## Final RPC boundary

The earlier report incorrectly inferred that the gateway ignored PostgreSQL `GRANT EXECUTE`.
Pinned official `@cloudbase/js-sdk@3.9.0` tests now prove the opposite: the CloudBase PG RPC gateway
enforces function ACLs for anonymous and authenticated callers.

The checked-in `rpc-catalog.json` enumerates and exclusively classifies all 131 final public
functions:

| Classification                    | Count |
| --------------------------------- | ----: |
| Externally callable authenticated |    26 |
| Externally callable anonymous     |     2 |
| Trigger                           |    12 |
| Internal helper                   |    31 |
| Obsolete legacy                   |    32 |
| Phase 4                           |    28 |

The authenticated role also receives the two anonymous snapshot functions, so live catalog counts
are PUBLIC `0`, anon `2`, and authenticated `28`. The SDK invoked all 103 non-allowlisted public
functions as anon and again as controlled user A; every call was denied. It also proved that the
three private helpers and removed Phase 2 probe are not exposed as public RPCs.

The allowlist uses exact signatures, not names. Static and live checks assert:

- every public/app-private definer has `search_path=''` (108/108 live);
- PUBLIC has no function execute privilege;
- only the reviewed role has each external signature;
- authenticated external RPCs reach the claim helper and reviewed owner/business authorization;
- no external function accepts an owner/user identity argument as authority;
- anonymous RPCs are only `get_public_itinerary_v4(uuid)` and
  `get_public_share_page_v3(uuid)`, both returning persisted public-token snapshots.

Legacy and Phase 4 functions remain for schema compatibility, but ACL enforcement plus the real SDK
matrix proves they are unavailable to browser roles. Future cleanup may drop obsolete versions in a
separately reviewed migration.

## RLS and A/B evidence

Username/password login is enabled. `trip-planner-cn-test-a` and
`trip-planner-cn-test-b` are admin-created controlled users. Email, phone, SMS, WeChat, and
anonymous public registration remain off; no signup UI/API was added and
`backendCapabilitiesByRegion.cn.selfRegistration` remains `false`. Passwords and the publishable
key are ignored local/CI secrets and are never printed or committed.

Two repeatable layers passed:

1. `database/cloudbase/verify/rls-session-claims.sql` creates A/B trips and a Share Page inside a
   transaction, asserts the complete private/public matrix, and rolls back even the fixtures on a
   successful run.
2. `test:cloudbase-pg-security` logs in through the pinned SDK, creates uniquely named A/B fixtures,
   asserts real JWT RLS and the real `update_trip_plan` business-RPC boundary, and removes both
   users' fixtures in `finally` (with unique-title recovery after partial failure).

| Assertion                               | SQL claims | Live SDK JWT |
| --------------------------------------- | ---------- | ------------ |
| A reads its own trip                    | pass       | pass         |
| A reads/updates/deletes B trip          | denied     | denied       |
| A forges `owner_id`                     | denied     | denied       |
| A invokes business RPC against B        | denied     | denied       |
| Anonymous reads private Trips           | denied     | denied       |
| Valid public token returns one snapshot | pass       | rollback SQL |
| Unknown token is unavailable            | pass       | rollback SQL |
| Revoked token is unavailable            | pass       | rollback SQL |

The SDK currently tries to JSON-parse scalar UUID results from `create_trip`. The RPC commits, so
the live test resolves the fixture by its unique title in the same authenticated RLS session. This
is a compatibility risk for the Phase 3 adapter, not a security bypass.

After all SQL and SDK tests, `trips`, `trip_members`, `profiles`, `public_itinerary_links`, and
`assets` each contain zero rows. Two Share Page rows left by intermediate test development were
identified by both controlled creator ID and unique title prefix and explicitly removed; the final
repeatable path leaves no orphan Share Page.

## Fail-closed verification

`database/cloudbase/verify/security.sql` raises on any of the following:

- a public table without ENABLE and FORCE RLS;
- an UPDATE policy without both `USING` and `WITH CHECK`;
- unexpected anon table access or authenticated access to reviewed private tables;
- unsafe definer search path or PUBLIC execute;
- any exact-signature callable-catalog drift;
- a non-`varchar(64)` ownership column;
- the probe or private helpers appearing in `public`.

The live result was `cloudbase_security_verified`. The remote final catalog is 131 public functions,
3 private helpers, 108 security definers with 108 safe search paths, 2 anon callable functions, and
28 authenticated callable functions.

## Reproduction

Non-secret CI/local commands:

```sh
npm ci
npm run check:cloudbase-pg-baseline
npm run check:database-pg-migrations
npm run check:cloudbase-pg-rpc-surface
npm run lint
npm run typecheck
npm test
npm run check:backend-provider-boundary
npm run check:maps-provider-boundary
npm run check:build-secret-boundary
npm run format:check
npm run build
```

After Device Login, `auth/set_env`, `queryEnv(info)`, and read-only database/empty-data checks, the
manual secret-backed layer is:

```sh
npm run check:cloudbase-pg-target -- \
  --env-id trip-planner-cn-dev-d3bz94038b26 \
  --region ap-shanghai \
  --instance-id pgdb-l4lhtrv7
npm run test:cloudbase-pg-rpc-surface
npm run test:cloudbase-pg-security
```

Run the two assertion SQL files through the CloudBase PG management surface with the same explicit
Env/instance pair. CI keeps these network/secret tests in the manually dispatched
`cloudbase-pg-dev` protected environment; global pull-request CI needs no CloudBase secret.

The Global regression build also passed with the existing Global provider selectors. Production
smoke checks returned HTTP 200 and the expected forms for both `/login` and `/signup`. No source
route, Global provider configuration, or Supabase migration changed in this follow-up.

## Remaining risks

- Phase 3 must handle the SDK scalar-UUID response behavior and reverify the actual session and
  repository adapters.
- Internal business authorization remains mandatory even though the gateway enforces EXECUTE.
- Storage metadata exists, but buckets, objects, signed URLs, cleanup, and jobs remain Phase 4.
- Realtime remains unavailable and must not be faked.
- The disposable free/shared instance still lacks a proven unattended backup/restore path.
- `npm audit` reports six high-severity findings in the repository's existing Next.js, Sharp, and
  transitive tooling dependency graph. None is on a CloudBase SDK dependency path; remediation is
  outside this schema-only phase and should be handled as a separate dependency update.
- **免费实例无法提供无人值守直连 migration credential**. Phase 2 uses authenticated CloudBase
  plugin migrations with explicit targets and does not require `CLOUDBASE_PG_MIGRATION_URL`.

DMC remains a manual fallback only when MCP is unavailable. Do not create/reset a management
password or make a direct PostgreSQL URL a Phase 2 prerequisite.
