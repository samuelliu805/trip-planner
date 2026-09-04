import { readFileSync } from "node:fs";
import { join } from "node:path";
import { root } from "./lib/cloudbase-pg-baseline-lib.mjs";
import {
  functionAclDenied,
  gatewayFunctionUnavailable,
  initializeLiveClient,
  loadLiveConfig,
  signIn,
} from "./lib/cloudbase-pg-live.mjs";

const dummyUuid = "00000000-0000-4000-8000-000000000001";

function valueFor(type) {
  if (type.endsWith("[]")) return [];
  if (type === "uuid") return dummyUuid;
  if (type === "boolean") return false;
  if (["integer", "bigint", "numeric", "double precision"].includes(type)) return 0;
  if (type === "json" || type === "jsonb") return {};
  if (type === "date") return "2026-01-01";
  if (type.includes("timestamp")) return "2026-01-01T00:00:00Z";
  if (type === "public_itinerary_view") return "overview";
  return "";
}

async function proveDenied(db, routines, actor) {
  for (const routine of routines) {
    const name = routine.signature.slice(0, routine.signature.indexOf("("));
    const args = Object.fromEntries(
      routine.arguments.map((argument) => [argument.name, valueFor(argument.type)]),
    );
    const result = await db.rpc(name, args);
    if (!functionAclDenied(result, name) && !gatewayFunctionUnavailable(result, name)) {
      const code = String(result?.error?.code ?? "no_error");
      const reason = String(result?.error?.message ?? "no error").slice(0, 120);
      throw new Error(`${actor} unexpectedly reached ${routine.signature} (${code}: ${reason})`);
    }
  }
}

async function proveReachable(db, routines, actor) {
  for (const routine of routines) {
    const name = routine.signature.slice(0, routine.signature.indexOf("("));
    const args = Object.fromEntries(
      routine.arguments.map((argument) => [argument.name, valueFor(argument.type)]),
    );
    const result = await db.rpc(name, args);
    if (functionAclDenied(result, name) || gatewayFunctionUnavailable(result, name)) {
      throw new Error(`${actor} could not reach required policy helper ${routine.signature}`);
    }
  }
}

async function run() {
  const config = loadLiveConfig();
  const { auth, db } = initializeLiveClient(config);
  const manifest = JSON.parse(
    readFileSync(join(root, "database/cloudbase/rpc-catalog.json"), "utf8"),
  );
  const anonymousDenied = manifest.catalog.filter(
    (routine) => !routine.category.startsWith("external_"),
  );
  const authenticatedDenied = anonymousDenied.filter(
    (routine) => routine.category !== "policy_helper",
  );
  const policyHelpers = manifest.catalog.filter((routine) => routine.category === "policy_helper");
  const knownDenied = anonymousDenied[0].signature.slice(
    0,
    anonymousDenied[0].signature.indexOf("("),
  );
  const knownArgs = Object.fromEntries(
    anonymousDenied[0].arguments.map((argument) => [argument.name, valueFor(argument.type)]),
  );
  const knownResult = await db.rpc(knownDenied, knownArgs);
  if (!functionAclDenied(knownResult, knownDenied)) {
    throw new Error("Known denied function did not produce the reviewed ACL denial");
  }
  await proveDenied(db, anonymousDenied, "anonymous");

  await signIn(auth, "trip-planner-cn-test-a", config.CLOUDBASE_TEST_USER_A_PASSWORD);
  await proveDenied(db, authenticatedDenied, "authenticated");
  await proveReachable(db, policyHelpers, "authenticated");

  for (const [name, args] of [
    ["app_current_user_id", {}],
    ["is_trip_member", { target_trip_id: dummyUuid }],
    ["variant_trip_id", { target_variant_id: dummyUuid }],
    ["phase2_rename_owned_trip", { target_trip_id: dummyUuid, requested_title: "denied" }],
  ]) {
    const result = await db.rpc(name, args);
    if (!gatewayFunctionUnavailable(result, name))
      throw new Error(`Private or removed helper was exposed: ${name}`);
  }
  await auth.signOut();
  console.log(
    `CloudBase SDK proved ${authenticatedDenied.length} internal public functions inaccessible to anon and authenticated.`,
  );
  console.log(
    `${policyHelpers.length} RLS policy helpers are authenticated-only and remain inaccessible to anon.`,
  );
  console.log(`Known denied function ${knownDenied} produced DATABASE_42501.`);
  console.log(
    "Three private helpers and the removed Phase 2 probe are not exposed as public RPCs.",
  );
}

run().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : "RPC exposure test failed");
    process.exit(1);
  },
);
