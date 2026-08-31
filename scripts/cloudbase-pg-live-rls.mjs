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

function failureMessage(error) {
  return error instanceof Error ? error.message : "unknown cleanup failure";
}

function session(result, label) {
  const data = dataOrThrow(result, label);
  return data?.session ?? data ?? null;
}

async function assertSessionLifecycle(auth, expectedUserId) {
  let current = session(await auth.getSession(), "session read after sign-in");
  if (!current?.access_token || !current?.refresh_token) {
    throw new Error("Authenticated session tokens are unavailable");
  }
  dataOrThrow(
    await auth.setSession({
      access_token: current.access_token,
      refresh_token: current.refresh_token,
    }),
    "session restore",
  );
  current = session(await auth.getSession(), "restored session verification");
  if (String(current?.user?.id ?? "") !== expectedUserId) {
    throw new Error("Restored session identity mismatch");
  }
}

async function assertRefreshLifecycle(auth, expectedUserId) {
  const current = session(await auth.getSession(), "session read before refresh");
  if (!current?.refresh_token) throw new Error("Refresh token is unavailable");
  await auth.setSession({
    access_token: "expired.invalid.token",
    refresh_token: current.refresh_token,
  });
  const refreshed = session(await auth.refreshSession(current.refresh_token), "session refresh");
  if (String(refreshed?.user?.id ?? "") !== expectedUserId || !refreshed?.access_token) {
    throw new Error("Refreshed session identity mismatch");
  }
}

async function assertSignedOut(auth, label) {
  const result = await auth.getSession();
  if (result?.error) return;
  const current = result?.data?.session ?? result?.data ?? null;
  if (current?.user) throw new Error(`${label} retained an authenticated session`);
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

async function fixtureGraph(db, tripIds) {
  if (!tripIds.length) return { memberIds: [], variantIds: [], dayIds: [] };
  const members = rows(
    await db.from("trip_members").select("trip_id,user_id").in("trip_id", tripIds),
    "cleanup membership lookup",
  );
  const variants = rows(
    await db.from("route_variants").select("id,trip_id").in("trip_id", tripIds),
    "cleanup variant lookup",
  );
  const variantIds = variants.map((row) => row.id);
  const days = variantIds.length
    ? rows(
        await db.from("trip_days").select("id,variant_id").in("variant_id", variantIds),
        "cleanup day lookup",
      )
    : [];
  return {
    memberIds: members.map((row) => `${row.trip_id}:${row.user_id}`),
    variantIds,
    dayIds: days.map((row) => row.id),
  };
}

async function deleteOwnedFixtures(auth, db, username, password, knownTripId) {
  const failures = [];
  try {
    await auth.signOut();
  } catch (error) {
    failures.push(`${username} pre-cleanup sign-out: ${failureMessage(error)}`);
  }
  try {
    await signIn(auth, username, password);
    const discovered = rows(
      await db.from("trips").select("id").like("title", `${runLabel}%`),
      `${username} cleanup lookup`,
    ).map((trip) => trip.id);
    const tripIds = [...new Set([knownTripId, ...discovered].filter(Boolean))];
    const graph = await fixtureGraph(db, tripIds);

    for (const id of tripIds) {
      try {
        const deleted = rows(
          await db.from("trips").delete().eq("id", id).select("id"),
          `${username} cleanup delete`,
        );
        if (deleted.length !== 1 || deleted[0].id !== id) {
          failures.push(`${username} cleanup delete returned no exact row for ${id}`);
        }
      } catch (error) {
        failures.push(`${username} cleanup delete ${id}: ${failureMessage(error)}`);
      }
    }

    const remainingTrips = rows(
      await db.from("trips").select("id").like("title", `${runLabel}%`),
      `${username} final prefix query`,
    );
    if (remainingTrips.length) failures.push(`${username} still sees controlled trips`);

    if (tripIds.length) {
      const remainingMembers = rows(
        await db.from("trip_members").select("trip_id,user_id").in("trip_id", tripIds),
        `${username} final membership query`,
      );
      const remainingVariants = rows(
        await db.from("route_variants").select("id").in("trip_id", tripIds),
        `${username} final variant query`,
      );
      const remainingDays = graph.variantIds.length
        ? rows(
            await db.from("trip_days").select("id").in("variant_id", graph.variantIds),
            `${username} final day query`,
          )
        : [];
      if (remainingMembers.length || remainingVariants.length || remainingDays.length) {
        failures.push(`${username} still sees cascading fixtures`);
      }
    }
  } catch (error) {
    failures.push(`${username} cleanup verification: ${failureMessage(error)}`);
  }
  return failures;
}

async function runAssertions(auth, db, config) {
  let aTrip = null;
  let bTrip = null;
  let assertionFailure = null;
  try {
    const aId = await signIn(auth, userA, config.CLOUDBASE_TEST_USER_A_PASSWORD);
    await assertSessionLifecycle(auth, aId);
    aTrip = await createTrip(db, `${runLabel}-a`);
    const updated = await db.rpc("update_trip_plan", {
      target_trip_id: aTrip,
      trip_title: `${runLabel}-a-updated`,
      trip_start_date: null,
      trip_end_date: null,
      trip_day_count: 1,
      trip_timezone: "UTC",
      trip_currency: "USD",
    });
    if (
      updated.error &&
      !/(?:SyntaxError:.*JSON|not valid JSON|JSON at position)/i.test(
        String(updated.error.message ?? ""),
      )
    ) {
      dataOrThrow(updated, "A own update_trip_plan");
    }
    const status = rows(
      await db.from("trips").update({ status: "done" }).eq("id", aTrip).select("id,status"),
      "A own status update",
    );
    if (status.length !== 1 || status[0].status !== "done") {
      throw new Error("A own status update mismatch");
    }
    dataOrThrow(await auth.signOut(), "A sign out");
    await assertSignedOut(auth, "A sign out");

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

    const forgedInsert = await db
      .from("trips")
      .insert({
        currency: "USD",
        day_count: 1,
        owner_id: bId,
        status: "open",
        timezone: "UTC",
        title: `${runLabel}-forged-owner`,
      })
      .select("id");
    if (!forgedInsert.error && rows(forgedInsert, "owner forge insert").length) {
      throw new Error("A inserted a trip with B's owner_id");
    }

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
    await assertSignedOut(auth, "A sign out before anonymous checks");
    const anonymousPrivate = await db.from("trips").select("id").in("id", [aTrip, bTrip]);
    if (!anonymousPrivate.error && rows(anonymousPrivate, "anonymous private read").length) {
      throw new Error("Anonymous read private resources");
    }
    await signIn(auth, userB, config.CLOUDBASE_TEST_USER_B_PASSWORD);
    const bOwn = rows(await db.from("trips").select("id,title").eq("id", bTrip), "B own read");
    if (bOwn.length !== 1 || bOwn[0].title !== `${runLabel}-b`) {
      throw new Error("B fixture changed after A's mutation attempts");
    }
    await assertRefreshLifecycle(auth, bId);
  } catch (error) {
    assertionFailure = failureMessage(error);
  }

  const cleanupFailures = [];
  cleanupFailures.push(
    ...(await deleteOwnedFixtures(auth, db, userA, config.CLOUDBASE_TEST_USER_A_PASSWORD, aTrip)),
  );
  cleanupFailures.push(
    ...(await deleteOwnedFixtures(auth, db, userB, config.CLOUDBASE_TEST_USER_B_PASSWORD, bTrip)),
  );
  try {
    await auth.signOut();
  } catch (error) {
    cleanupFailures.push(`final sign-out: ${failureMessage(error)}`);
  }
  if (assertionFailure || cleanupFailures.length) {
    throw new Error(
      [assertionFailure && `security assertion: ${assertionFailure}`, ...cleanupFailures]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

async function run() {
  const config = loadLiveConfig();
  const { auth, db } = initializeLiveClient(config);
  await runAssertions(auth, db, config);
  console.log("CloudBase live A/B JWT RLS and business RPC security matrix passed.");
  console.log("Session restore, refresh, expiry boundary, and logout verification passed.");
  console.log("Both identities proved exact deletion and zero controlled/cascading fixtures.");
}

run().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : "CloudBase security test failed");
    process.exit(1);
  },
);
