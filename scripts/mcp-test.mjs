import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const temp = resolve(root, "node_modules/.cache", `mcp-test-${process.pid}`);
mkdirSync(temp, { recursive: true });
const entry = resolve(temp, "integration.test.mjs");
await build({
  entryPoints: [resolve(root, "src/features/ai/integration.test.ts")],
  outfile: entry,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  target: "node24",
});
const docker = (...args) =>
  execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const selectedProvider = process.env.MCP_TEST_PROVIDER_ONLY;
if (selectedProvider && !["supabase", "cloudbase"].includes(selectedProvider))
  throw new Error("MCP_TEST_PROVIDER_ONLY must be supabase or cloudbase");
for (const provider of selectedProvider ? [selectedProvider] : ["supabase", "cloudbase"]) {
  const container = `trip-mcp-${provider}-${process.pid}`;
  const password = randomBytes(24).toString("hex");
  const sql = (source) => {
    const output = spawnSync(
      "docker",
      ["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres"],
      { input: source, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    );
    if (output.status !== 0) throw new Error(output.stderr.slice(-5000));
  };
  try {
    docker(
      "run",
      "-d",
      "--name",
      container,
      "-p",
      "127.0.0.1::5432",
      "-e",
      `POSTGRES_PASSWORD=${password}`,
      "postgres:17-alpine",
    );
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        docker("exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres");
        break;
      } catch {
        if (attempt === 59) throw new Error("PostgreSQL startup failed");
        await new Promise((done) => setTimeout(done, 200));
      }
    }
    // Managed identity/storage schemas are local adapters. The entire real regional
    // migration chain and business RPCs run against PostgreSQL, without mock services.
    sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA extensions;
      CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon,authenticated,service_role;
      CREATE TABLE auth.users(id ${provider === "supabase" ? "uuid" : "text"} PRIMARY KEY,sub text GENERATED ALWAYS AS(id::text) STORED,email text,phone text,username text,raw_user_meta_data jsonb DEFAULT '{}');
      CREATE FUNCTION auth.uid() RETURNS ${provider === "supabase" ? "uuid" : "text"} LANGUAGE sql STABLE AS $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')${provider === "supabase" ? "::uuid" : ""} $$;
      CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[],updated_at timestamptz DEFAULT now());
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text,owner uuid,owner_id text,metadata jsonb,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),UNIQUE(bucket_id,name));
      CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
      CREATE FUNCTION storage.allow_any_operation(text[]) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
      GRANT USAGE ON SCHEMA auth,storage TO anon,authenticated,service_role;
      GRANT SELECT ON auth.users TO authenticated;`);
    const directory = resolve(
      root,
      provider === "supabase" ? "supabase/migrations" : "cloudbase/migrations",
    );
    for (const file of readdirSync(directory)
      .filter((file) => file.endsWith(".sql"))
      .sort()) {
      try {
        sql(readFileSync(resolve(directory, file), "utf8"));
      } catch (error) {
        throw new Error(`${file}: ${error.message}`);
      }
    }
    const port = docker("port", container, "5432/tcp").trim().split(":").at(-1);
    const namePattern = process.env.MCP_TEST_NAME_PATTERN;
    const result = spawnSync(
      process.execPath,
      ["--test", ...(namePattern ? [`--test-name-pattern=${namePattern}`] : []), entry],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          MCP_TEST_DATABASE_URL: `postgres://postgres:${password}@127.0.0.1:${port}/postgres`,
          MCP_TEST_PROVIDER: provider,
        },
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    if (result.status !== 0)
      throw new Error(`${provider}: ${result.stdout.slice(-11000)}\n${result.stderr.slice(-3000)}`);
    console.log(`${provider}: real PostgreSQL + OAuth library + MCP SDK integration passed.`);
  } finally {
    docker("rm", "-f", container);
    if (docker("ps", "-a", "--filter", `name=^/${container}$`, "--format", "{{.Names}}").trim())
      throw new Error("Test container residue");
  }
}
rmSync(temp, { recursive: true, force: true });
