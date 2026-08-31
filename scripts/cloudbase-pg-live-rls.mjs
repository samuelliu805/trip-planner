import {
  dataOrThrow,
  initializeLiveClient,
  loadLiveConfig,
  signIn,
} from "./lib/cloudbase-pg-live.mjs";

const userA = "trip-planner-cn-test-a";
const userB = "trip-planner-cn-test-b";
const runLabel = `cloudbase-security-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function rows(result, label) {
  const data = dataOrThrow(result, label);
  return Array.isArray(data) ? data : data == null ? [] : [data];
}

async function createTrip(db, title) {
  const rpc = await db.rpc("create_trip", {
    trip_title: title,
    trip_start_date: null,
    trip_end_date: null,
    trip_timezone: "UTC",
    trip_currency: "USD",
    trip_day_count: 1,
  });
  if (
    rpc.error &&
    !/(?:SyntaxError:.*JSON|not valid JSON|JSON at position)/i.test(String(rpc.error.message ?? ""))
  ) {
    dataOrThrow(rpc, "fixture create_trip");
  }
  // SDK 3.9.0 currently tries to JSON.parse a scalar UUID response. The RPC commits first, so
  // resolve the fixture through the unique controlled title under the same RLS session.
  const created = rows(await db.from("trips").select("id").eq("title", title), "fixture lookup");
  if (created.length !== 1) throw new Error("create_trip fixture lookup mismatch");
  return created[0].id;
}

async function deleteOwnedFixtures(auth, db, username, password, knownTripId) {
  try {
    await auth.signOut();
    await signIn(auth, username, password);
    let ids = knownTripId ? [knownTripId] : [];
    if (!ids.length) {
      ids = rows(
        await db.from("trips").select("id").like("title", `${runLabel}%`),
        "cleanup lookup",
      ).map((trip) => trip.id);
    }
    for (const id of ids) dataOrThrow(await db.from("trips").delete().eq("id", id), "cleanup trip");
  } catch {
    // The caller reports cleanup failure after trying the other controlled identity.
    return false;
  }
  return true;
}

async function run() {
  const config = loadLiveConfig();
  const { auth, db } = initializeLiveClient(config);
  let aTrip = null;
  let bTrip = null;
  let cleanupA = false;
  let cleanupB = false;
  try {
    const aId = await signIn(auth, userA, config.CLOUDBASE_TEST_USER_A_PASSWORD);
    aTrip = await createTrip(db, `${runLabel}-a`);
    dataOrThrow(await auth.signOut(), "A sign out");

    const bId = await signIn(auth, userB, config.CLOUDBASE_TEST_USER_B_PASSWORD);
    if (bId === aId) throw new Error("Controlled users A and B resolved to the same identity");
    bTrip = await createTrip(db, `${runLabel}-b`);
    dataOrThrow(await auth.signOut(), "B sign out");

    await signIn(auth, userA, config.CLOUDBASE_TEST_USER_A_PASSWORD);
    const own = rows(await db.from("trips").select("id,owner_id").eq("id", aTrip), "A own read");
    if (own.length !== 1 || own[0].owner_id !== aId) throw new Error("A own read mismatch");
    if (rows(await db.from("trips").select("id").eq("id", bTrip), "A cross read").length) {
      throw new Error("A read B's trip");
    }
    const crossUpdate = rows(
      await db
        .from("trips")
        .update({ title: `${runLabel}-forbidden` })
        .eq("id", bTrip)
        .select("id"),
      "A cross update",
    );
    const crossDelete = rows(
      await db.from("trips").delete().eq("id", bTrip).select("id"),
      "A cross delete",
    );
    if (crossUpdate.length || crossDelete.length) throw new Error("A mutated B's trip directly");

    const spoof = await db
      .from("trips")
      .update({ owner_id: bId })
      .eq("id", aTrip)
      .select("owner_id");
    if (!spoof.error && rows(spoof, "owner spoof")[0]?.owner_id !== aId) {
      throw new Error("A forged owner_id");
    }
    const crossRpc = await db.rpc("update_trip_plan", {
      target_trip_id: bTrip,
      trip_title: `${runLabel}-rpc-forbidden`,
      trip_start_date: null,
      trip_end_date: null,
      trip_day_count: 1,
      trip_timezone: "UTC",
      trip_currency: "USD",
    });
    if (!crossRpc.error) throw new Error("A business RPC mutated B's trip");

    dataOrThrow(await auth.signOut(), "A sign out before public checks");

    const anonymousPrivate = await db.from("trips").select("id").in("id", [aTrip, bTrip]);
    if (!anonymousPrivate.error && rows(anonymousPrivate, "anonymous private read").length) {
      throw new Error("Anonymous read private resources");
    }
    await signIn(auth, userB, config.CLOUDBASE_TEST_USER_B_PASSWORD);
    const bOwn = rows(await db.from("trips").select("id,title").eq("id", bTrip), "B own read");
    if (bOwn.length !== 1 || bOwn[0].title !== `${runLabel}-b`) {
      throw new Error("B fixture changed after A's mutation attempts");
    }
  } finally {
    cleanupA = await deleteOwnedFixtures(
      auth,
      db,
      userA,
      config.CLOUDBASE_TEST_USER_A_PASSWORD,
      aTrip,
    );
    cleanupB = await deleteOwnedFixtures(
      auth,
      db,
      userB,
      config.CLOUDBASE_TEST_USER_B_PASSWORD,
      bTrip,
    );
    try {
      await auth.signOut();
    } catch {}
    if (!cleanupA || !cleanupB) throw new Error("Controlled fixture cleanup failed");
  }
  console.log("CloudBase live A/B JWT RLS and business RPC security matrix passed.");
  console.log("All controlled fixtures were removed.");
}

run().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : "CloudBase security test failed");
    process.exit(1);
  },
);
