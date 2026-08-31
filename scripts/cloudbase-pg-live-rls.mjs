import { createRequire } from "node:module";
import { join } from "node:path";
import { readFileSync } from "node:fs";

function readLocalEnv() {
  const names = new Set([
    "CLOUDBASE_ENV_ID",
    "CLOUDBASE_REGION",
    "CLOUDBASE_PG_INSTANCE_ID",
    "CLOUDBASE_TEST_USER_A_PASSWORD",
    "CLOUDBASE_TEST_USER_B_PASSWORD",
  ]);
  const selected = {};
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const name = line.slice(0, separator);
    if (!names.has(name)) continue;
    if (name in selected) throw new Error(`${name} is duplicated`);
    selected[name] = line.slice(separator + 1);
  }
  for (const name of names) {
    if (!selected[name]) throw new Error(`${name} is missing`);
  }
  return selected;
}

function assertResult(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message ?? result.error}`);
  return result.data ?? [];
}

async function signIn(auth, username, password, expectedId) {
  assertResult(await auth.signInWithPassword({ username, password }), `${username} login`);
  const sessionResult = await auth.getSession();
  const session = assertResult(sessionResult, `${username} session`)?.session;
  const actualId = String(session?.user?.id ?? session?.user?.sub ?? session?.sub ?? "");
  if (!session || actualId !== expectedId) throw new Error(`${username} session identity mismatch`);
}

const [aTrip, bTrip, aId, bId] = process.argv.slice(2);
if (![aTrip, bTrip, aId, bId].every(Boolean)) {
  throw new Error("Expected A trip, B trip, A user ID, and B user ID arguments");
}

const sdkPrefix = process.env.CLOUDBASE_SDK_PREFIX;
const publishableKey = process.env.CLOUDBASE_PUBLISHABLE_KEY;
if (!sdkPrefix || !publishableKey)
  throw new Error("Temporary SDK path or publishable key is missing");

const config = readLocalEnv();
const expectedTarget = {
  CLOUDBASE_ENV_ID: "trip-planner-cn-dev-d3bz94038b26",
  CLOUDBASE_REGION: "ap-shanghai",
  CLOUDBASE_PG_INSTANCE_ID: "pgdb-l4lhtrv7",
};
for (const [name, expected] of Object.entries(expectedTarget)) {
  if (config[name] !== expected) throw new Error(`Unexpected CloudBase target: ${name}`);
}

const require = createRequire(join(sdkPrefix, "package.json"));
const cloudbase = require("@cloudbase/js-sdk");
const app = cloudbase.init({
  env: config.CLOUDBASE_ENV_ID,
  region: config.CLOUDBASE_REGION,
  accessKey: publishableKey,
  auth: { detectSessionInUrl: false },
});
const auth = app.auth;
const db = app.rdb();

await signIn(auth, "trip-planner-cn-test-a", config.CLOUDBASE_TEST_USER_A_PASSWORD, aId);
const aOwn = assertResult(
  await db.from("trips").select("id,owner_id,title").eq("id", aTrip),
  "A own read",
);
const aReadsB = assertResult(await db.from("trips").select("id").eq("id", bTrip), "A cross read");
if (aOwn.length !== 1 || aOwn[0].owner_id !== aId) throw new Error("A own read mismatch");
if (aReadsB.length !== 0) throw new Error("A read B's trip");

assertResult(
  await db.from("trips").update({ title: "forbidden live update" }).eq("id", bTrip),
  "A cross update",
);
assertResult(await db.from("trips").delete().eq("id", bTrip), "A cross delete");

const spoof = await db.from("trips").update({ owner_id: bId }).eq("id", aTrip);
if (!spoof.error) {
  const afterSpoof = assertResult(
    await db.from("trips").select("owner_id").eq("id", aTrip),
    "A owner read after spoof",
  );
  if (afterSpoof[0]?.owner_id !== aId) throw new Error("A forged owner_id");
}
assertResult(await auth.signOut(), "A sign out");

await signIn(auth, "trip-planner-cn-test-b", config.CLOUDBASE_TEST_USER_B_PASSWORD, bId);
const bOwn = assertResult(
  await db.from("trips").select("id,owner_id,title").eq("id", bTrip),
  "B own read",
);
if (bOwn.length !== 1 || bOwn[0].owner_id !== bId || bOwn[0].title !== "Phase 2 live B") {
  throw new Error("B trip changed after A's cross-user attempts");
}
assertResult(await auth.signOut(), "B sign out");

const anonymous = await db.from("trips").select("id").in("id", [aTrip, bTrip]);
if (!anonymous.error && (anonymous.data?.length ?? 0) > 0) {
  throw new Error("Anonymous read private trips");
}

console.log("Live JWT RLS passed with CloudBase JS SDK 3.x.");
console.log(
  "A own read=1; A read/update/delete B=0; owner spoof denied; anonymous private read=0.",
);
