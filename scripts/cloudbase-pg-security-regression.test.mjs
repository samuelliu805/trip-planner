import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";
import { functionAclDenied, gatewayFunctionUnavailable } from "./lib/cloudbase-pg-live.mjs";
import {
  assertMigrationInventory,
  renderCloudbaseFunctionAcl,
  renderProviderMigration,
} from "./database-pg-migrations.mjs";
import { root } from "./lib/cloudbase-pg-baseline-lib.mjs";

const fixtureDir = join(root, "scripts/fixtures/cloudbase-pg");

test("only the exact observed function ACL denial is accepted", () => {
  assert.equal(
    functionAclDenied(
      {
        error: {
          code: "DATABASE_42501",
          message: "permission denied for function remove_trip_day",
        },
      },
      "remove_trip_day",
    ),
    true,
  );
  assert.equal(
    functionAclDenied(
      { error: { code: "DATABASE_22023", message: "Day not found" } },
      "remove_trip_day",
    ),
    false,
  );
  assert.equal(
    functionAclDenied(
      { error: { code: "DATABASE_42501", message: "Trip not found" } },
      "remove_trip_day",
    ),
    false,
  );
});

test("private functions accept only the exact gateway schema-cache denial", () => {
  assert.equal(
    gatewayFunctionUnavailable(
      {
        error: {
          code: "DATABASE_PGRST202",
          message:
            "Could not find the function public.app_current_user_id without parameters in the schema cache",
        },
      },
      "app_current_user_id",
    ),
    true,
  );
  assert.equal(
    gatewayFunctionUnavailable(
      { error: { code: "DATABASE_22023", message: "Function not found" } },
      "app_current_user_id",
    ),
    false,
  );
});

test("an unmatched direct provider migration fails the migration 64+ invariant", () => {
  const fixture = JSON.parse(
    readFileSync(join(fixtureDir, "unmatched-provider-migrations.json"), "utf8"),
  );
  assert.throws(() => assertMigrationInventory(fixture), /unreviewed_direct_change/);
  fixture.providerOnly.push({
    provider: "supabase",
    file: "20260901000100_unreviewed_direct_change.sql",
  });
  assert.doesNotThrow(() => assertMigrationInventory(fixture));
});

test("a generated unallowlisted SECURITY DEFINER is revoked before commit", () => {
  const sql = readFileSync(join(fixtureDir, "unallowlisted-security-definer.sql"), "utf8");
  const allowlist = {
    authenticated: [],
    anonymous: [],
  };
  const acl = renderCloudbaseFunctionAcl(sql, allowlist);
  assert.match(
    acl,
    /REVOKE EXECUTE ON FUNCTION public\.fixture_internal_rpc\(uuid\) FROM PUBLIC, anon, authenticated;/,
  );
  assert.doesNotMatch(acl, /GRANT EXECUTE/);
  const generated = renderProviderMigration({
    file: "20260901000000_fixture.sql",
    provider: "CloudBase",
    shared: `BEGIN;\n${sql}\nCOMMIT;`,
    allowlist,
  });
  assert.ok(generated.indexOf("REVOKE EXECUTE") < generated.lastIndexOf("COMMIT;"));
  assert.equal(generated.match(/\bBEGIN;/g)?.length, 1);
  assert.equal(generated.match(/\bCOMMIT;/g)?.length, 1);
});

test("an unsafe generated SECURITY DEFINER fails closed", () => {
  assert.throws(
    () =>
      renderCloudbaseFunctionAcl(
        `CREATE FUNCTION public.unsafe_fixture() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN END; $$;`,
        { authenticated: [], anonymous: [] },
      ),
    /unsafe search_path/,
  );
});

test("an unqualified generated function cannot bypass exact ACL generation", () => {
  assert.throws(
    () =>
      renderCloudbaseFunctionAcl(
        `CREATE FUNCTION unqualified_fixture() RETURNS void LANGUAGE sql AS $$ SELECT; $$;`,
        { authenticated: [], anonymous: [] },
      ),
    /exact parseable signature/,
  );
});
