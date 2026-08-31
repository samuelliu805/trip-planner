# CloudBase PG migration process

The 63 files named in `database/cloudbase/bootstrap-manifest.json` are the immutable bootstrap
source. Their order and SHA-256 hashes are checked in CI. The generated baseline is only for a new,
approved empty database; future changes never rebuild or redeploy it to an existing instance.

## Migration 64 and later

1. Run `npm run new:database-pg-migration -- <UTC version> <snake_case_name>`.
2. Put provider-neutral DDL in `database/shared/migrations/<version>_<name>.sql`.
3. Add only the necessary delta, if any, under
   `database/supabase/overlays/migrations/` or `database/cloudbase/overlays/migrations/` using the
   same filename. Never duplicate the complete schema in an overlay.
4. Run `npm run build:database-pg-migrations`. This creates byte-derived Supabase and CloudBase
   migration artifacts with the same filename. Commit all sources and artifacts.
5. Run `npm run check:database-pg-migrations` and the normal schema/security checks.

CloudBase-only operational repair migrations may be checked in directly under
`cloudbase/migrations/`. They must be versioned, transactional where PostgreSQL permits, and must
not alter CloudBase-managed `auth` or `storage` schemas.

## Deployment guard

Committed SQL contains no environment or instance identifier, so another approved empty CloudBase
PG target can reuse it unchanged. Before every deployment, bind CloudBase with `auth/set_env`, query
the environment and PG context, and run:

```sh
npm run check:cloudbase-pg-target -- \
  --env-id <approved-env-id> \
  --region <approved-region> \
  --instance-id <approved-pg-instance-id>
```

Pass the same Env ID and PG instance ID explicitly to `managePgDatabase(action=applyMigration)`.
Also query `current_database()` and verify the reviewed migration version before DDL. Static
artifact checks intentionally do not read `.env.local` and do not require a direct PostgreSQL URL.
