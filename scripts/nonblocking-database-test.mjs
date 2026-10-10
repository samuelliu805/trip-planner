import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// Local PG17 only. Managed auth/storage schemas below are minimal schema adapters;
// storage transport and real auth are covered by the separate regional live suites.
const container = `trip-nonblocking-test-${process.pid}`;
const root = resolve(import.meta.dirname, "..");
const run = (...args) =>
  execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
function sql(query, label) {
  const result = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres"],
    { input: query, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.status !== 0) throw new Error(`${label}:\n${result.stderr.slice(-5000)}`);
}
const managed = (provider) => `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA extensions;
  CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon,authenticated,service_role;
  CREATE TABLE auth.users (id ${provider === "supabase" ? "uuid" : "text"} PRIMARY KEY, sub text GENERATED ALWAYS AS (id::text) STORED, email text, phone text, username text, raw_user_meta_data jsonb DEFAULT '{}');
  CREATE FUNCTION auth.uid() RETURNS ${provider === "supabase" ? "uuid" : "text"} LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub' ${provider === "supabase" ? "" : ""} $$;
  CREATE TABLE storage.buckets (id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[],updated_at timestamptz DEFAULT now());
  CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text,owner uuid,owner_id text,metadata jsonb,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(), UNIQUE(bucket_id,name));
  CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
  CREATE FUNCTION storage.allow_any_operation(text[]) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
  GRANT USAGE ON SCHEMA auth, storage TO anon,authenticated,service_role;
  GRANT SELECT ON auth.users TO authenticated;
`;
let primaryFailure;
try {
  run(
    "run",
    "-d",
    "--name",
    container,
    "--network",
    "none",
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "postgres:17-alpine",
  );
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      run("exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres");
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!ready) throw new Error("Local PostgreSQL did not start.");
  const provider = process.env.NONBLOCKING_DB_PROVIDER ?? "supabase";
  let bootstrap = managed(provider);
  if (provider === "supabase")
    bootstrap = bootstrap.replace(
      "SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'",
      "SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid",
    );
  sql(bootstrap, "managed schema adapters");
  const dir = resolve(
    root,
    provider === "supabase" ? "supabase/migrations" : "cloudbase/migrations",
  );
  let seeded = false;
  for (const file of readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    if (process.env.NONBLOCKING_DB_UPGRADE === "1" && !seeded && file.startsWith("20261009")) {
      sql(
        readFileSync(resolve(root, "scripts/fixtures/nonblocking/legacy-upgrade-seed.sql"), "utf8"),
        "representative legacy data",
      );
      seeded = true;
    }
    sql(readFileSync(resolve(dir, file), "utf8"), file);
  }
  if (seeded)
    sql(
      readFileSync(resolve(root, "scripts/fixtures/nonblocking/legacy-upgrade-assert.sql"), "utf8"),
      "legacy upgrade invariants",
    );
  console.log(
    `${provider}: PG17 migration chain passed (${seeded ? "existing trips, published pages, legacy Guest import and old RPC compatibility" : "empty database"}).`,
  );
  sql(
    readFileSync(resolve(root, "scripts/fixtures/nonblocking/database.sql"), "utf8"),
    "nonblocking RPC/RLS tests",
  );
  sql(
    readFileSync(resolve(root, "scripts/fixtures/nonblocking/guest-continuation.sql"), "utf8"),
    "Guest cutoff/continuation tests",
  );
  sql(
    readFileSync(resolve(root, "scripts/fixtures/nonblocking/image-exports.sql"), "utf8"),
    "export snapshot/replay tests",
  );
  sql(
    readFileSync(resolve(root, "scripts/fixtures/nonblocking/idea-workflows.sql"), "utf8"),
    "Idea workflow/version/replay tests",
  );
  console.log(
    `${provider}: identity, replay, versions, RLS and share consistency passed; fixtures rolled back.`,
  );
} catch (error) {
  primaryFailure = error;
  throw error;
} finally {
  try {
    run("rm", "-f", container);
  } catch (cleanupError) {
    if (primaryFailure)
      throw new AggregateError(
        [primaryFailure, cleanupError],
        "Database validation and container cleanup both failed.",
      );
    throw cleanupError;
  }
}
