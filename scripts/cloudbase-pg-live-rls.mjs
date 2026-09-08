import {
  dataOrThrow,
  initializeLiveClient,
  loadLiveConfig,
  signIn,
} from "./lib/cloudbase-pg-live.mjs";

const userA = "19900000101";
const userB = "19900000102";
const userC = "19900000103";
const runLabel = `cloudbase-security-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const unregisteredPhone = `198${Date.now().toString().slice(-8)}`;

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

function assertPublicProjection(projection, intendedTitle, privateTitle, ownerId) {
  if (!projection || projection.available !== true) {
    throw new Error("Anonymous public snapshot was unavailable");
  }
  const serialized = JSON.stringify(projection);
  if (!serialized.includes(intendedTitle)) throw new Error("Public snapshot lost intended data");
  for (const forbidden of [
    privateTitle,
    ownerId,
    "owner_id",
    "object_key",
    "trip-assets/",
    "AMAP_WEB_SERVICE_KEY",
    "CLOUDBASE_API_KEY",
    "CLOUDBASE_CAM_SECRET_ID",
    "CLOUDBASE_CAM_SECRET_KEY",
    "SUPABASE_SECRET_KEY",
    "tp-cn-access-token",
    "sb-access-token",
  ]) {
    if (serialized.includes(forbidden)) throw new Error(`Public snapshot leaked ${forbidden}`);
  }
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
  const rpc = await db.rpc("create_trip_v3", {
    trip_title: title,
    trip_start_date: null,
    trip_end_date: null,
    trip_timezone: "UTC",
    trip_currency: "USD",
    trip_day_count: 1,
    trip_locale: "en",
    target_operation_id: crypto.randomUUID(),
  });
  if (
    rpc.error &&
    !/(?:SyntaxError:.*JSON|not valid JSON|JSON at position)/i.test(String(rpc.error.message ?? ""))
  ) {
    dataOrThrow(rpc, "fixture create_trip_v3");
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
      await db.from("trips").select("id,version,content_version").like("title", `${runLabel}%`),
      `${username} cleanup lookup`,
    );
    const tripIds = [...new Set([knownTripId, ...discovered.map(({ id }) => id)].filter(Boolean))];
    const graph = await fixtureGraph(db, tripIds);

    for (const id of tripIds) {
      try {
        const trip =
          discovered.find((candidate) => candidate.id === id) ??
          rows(
            await db.from("trips").select("id,version,content_version").eq("id", id),
            `${username} cleanup version`,
          )[0];
        if (!trip) continue;
        dataOrThrow(
          await db.rpc("delete_trip_v3", {
            expected_content_version: trip.content_version,
            expected_version: trip.version,
            target_operation_id: crypto.randomUUID(),
            target_trip_id: id,
          }),
          `${username} cleanup delete`,
        );
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
  let aVariant = null;
  let bTrip = null;
  let publicToken = null;
  let sharedTripSnapshot = null;
  let invitedMemberId = null;
  let assertionFailure = null;
  try {
    const aId = await signIn(auth, userA, config.CLOUDBASE_TEST_USER_A_PASSWORD);
    await assertSessionLifecycle(auth, aId);
    aTrip = await createTrip(db, `${runLabel}-a`);
    const initialTrip = rows(
      await db.from("trips").select("content_version").eq("id", aTrip),
      "A trip content version",
    )[0];
    const updated = await db.rpc("update_trip_plan_v2", {
      target_trip_id: aTrip,
      trip_title: `${runLabel}-a-updated`,
      trip_start_date: null,
      trip_end_date: null,
      trip_day_count: 1,
      trip_timezone: "UTC",
      trip_currency: "USD",
      expected_version: 1,
      expected_content_version: initialTrip.content_version,
      target_operation_id: crypto.randomUUID(),
    });
    if (
      updated.error &&
      !/(?:SyntaxError:.*JSON|not valid JSON|JSON at position)/i.test(
        String(updated.error.message ?? ""),
      )
    ) {
      dataOrThrow(updated, "A own update_trip_plan_v2");
    }
    const statusUpdate = await db.rpc("update_trip_status", {
      expected_version: 2,
      target_operation_id: crypto.randomUUID(),
      target_status: "done",
      target_trip_id: aTrip,
    });
    if (
      statusUpdate.error &&
      !/(?:SyntaxError:.*JSON|not valid JSON|JSON at position)/i.test(
        String(statusUpdate.error.message ?? ""),
      )
    )
      dataOrThrow(statusUpdate, "A own status update");
    const intendedTitle = `${runLabel}-published`;
    const privateTitle = `${runLabel}-private-after-publish`;
    const publishTrip = rows(
      await db.from("trips").select("content_version").eq("id", aTrip),
      "A publish content version",
    )[0];
    const publishUpdate = await db.rpc("update_trip_plan_v2", {
      target_trip_id: aTrip,
      trip_title: intendedTitle,
      trip_start_date: null,
      trip_end_date: null,
      trip_day_count: 1,
      trip_timezone: "UTC",
      trip_currency: "USD",
      expected_version: 3,
      expected_content_version: publishTrip.content_version,
      target_operation_id: crypto.randomUUID(),
    });
    if (
      publishUpdate.error &&
      !/(?:SyntaxError:.*JSON|not valid JSON|JSON at position)/i.test(
        String(publishUpdate.error.message ?? ""),
      )
    ) {
      dataOrThrow(publishUpdate, "A publish title update");
    }
    aVariant = rows(
      await db
        .from("route_variants")
        .select("id,version")
        .eq("trip_id", aTrip)
        .eq("is_primary", true),
      "A primary variant",
    )[0]?.id;
    if (!aVariant) throw new Error("A primary variant was unavailable");
    const share = dataOrThrow(
      await db.rpc("create_share_page_v4", {
        expected_variant_version: rows(
          await db.from("route_variants").select("version").eq("id", aVariant),
          "A share variant version",
        )[0].version,
        target_operation_id: crypto.randomUUID(),
        target_variant_id: aVariant,
      }),
      "A immutable public share",
    );
    publicToken = share?.publicToken;
    if (!publicToken) throw new Error("A public share token was unavailable");
    const privateTrip = rows(
      await db.from("trips").select("content_version").eq("id", aTrip),
      "A private content version",
    )[0];
    const privateUpdate = await db.rpc("update_trip_plan_v2", {
      target_trip_id: aTrip,
      trip_title: privateTitle,
      trip_start_date: null,
      trip_end_date: null,
      trip_day_count: 1,
      trip_timezone: "UTC",
      trip_currency: "USD",
      expected_version: 4,
      expected_content_version: privateTrip.content_version,
      target_operation_id: crypto.randomUUID(),
    });
    if (
      privateUpdate.error &&
      !/(?:SyntaxError:.*JSON|not valid JSON|JSON at position)/i.test(
        String(privateUpdate.error.message ?? ""),
      )
    ) {
      dataOrThrow(privateUpdate, "A private title update");
    }
    if (
      dataOrThrow(
        await db.rpc("invite_trip_collaborator", {
          target_identifier: userB,
          target_operation_id: crypto.randomUUID(),
          target_trip_id: aTrip,
        }),
        "A phone invitation for B",
      ) !== true
    )
      throw new Error("Registered phone invitation did not create B membership");
    const membersBeforeUnregistered = rows(
      await db.from("trip_members").select("id,user_id").eq("trip_id", aTrip),
      "members before unregistered invitation",
    );
    dataOrThrow(
      await db.rpc("invite_trip_collaborator", {
        target_identifier: unregisteredPhone,
        target_operation_id: crypto.randomUUID(),
        target_trip_id: aTrip,
      }),
      "A unregistered phone invitation",
    );
    const membersAfterUnregistered = rows(
      await db.from("trip_members").select("id,user_id").eq("trip_id", aTrip),
      "members after unregistered invitation",
    );
    if (membersAfterUnregistered.length !== membersBeforeUnregistered.length)
      throw new Error("Unregistered phone invitation created a membership");
    sharedTripSnapshot = rows(
      await db.from("trips").select("version,content_version").eq("id", aTrip),
      "A shared conflict snapshot",
    )[0];
    dataOrThrow(await auth.signOut(), "A sign out");
    await assertSignedOut(auth, "A sign out");

    const bId = await signIn(auth, userB, config.CLOUDBASE_TEST_USER_B_PASSWORD);
    if (bId === aId) throw new Error("Controlled users A and B resolved to the same identity");
    bTrip = await createTrip(db, `${runLabel}-b`);
    const sharedTrip = rows(
      await db.from("trips").select("id,version,content_version").eq("id", aTrip),
      "B collaborator Trips visibility",
    )[0];
    if (!sharedTrip) throw new Error("B did not see A's shared Trip");
    const bMembership = rows(
      await db.from("trip_members").select("id,role").eq("trip_id", aTrip).eq("user_id", bId),
      "B collaborator role",
    )[0];
    if (bMembership?.role !== "collaborator") throw new Error("B role was not collaborator");
    dataOrThrow(
      await db.rpc("update_trip_plan_v2", {
        target_trip_id: aTrip,
        trip_title: `${runLabel}-collaborator-edit`,
        trip_start_date: null,
        trip_end_date: null,
        trip_day_count: 1,
        trip_timezone: "UTC",
        trip_currency: "USD",
        expected_version: sharedTrip.version,
        expected_content_version: sharedTrip.content_version,
        target_operation_id: crypto.randomUUID(),
      }),
      "B collaborator trip edit",
    );
    if (
      dataOrThrow(
        await db.rpc("invite_trip_collaborator", {
          target_identifier: userC,
          target_operation_id: crypto.randomUUID(),
          target_trip_id: aTrip,
        }),
        "B collaborator phone invitation for C",
      ) !== true
    )
      throw new Error("B could not invite registered collaborator C");
    invitedMemberId = rows(
      await db.from("trip_members").select("id").eq("trip_id", aTrip).neq("user_id", bId),
      "C membership lookup",
    ).find(({ id }) => id !== bMembership.id)?.id;
    if (!invitedMemberId) throw new Error("C membership was not created");
    const forbiddenRemove = await db.rpc("remove_trip_collaborator", {
      target_member_id: invitedMemberId,
      target_operation_id: crypto.randomUUID(),
      target_trip_id: aTrip,
    });
    if (!forbiddenRemove.error) throw new Error("B removed a collaborator");
    const forbiddenDelete = await db.rpc("delete_trip_v3", {
      expected_content_version: sharedTrip.content_version,
      expected_version: sharedTrip.version,
      target_operation_id: crypto.randomUUID(),
      target_trip_id: aTrip,
    });
    if (!forbiddenDelete.error) throw new Error("B deleted the shared Trip");

    const researchId = crypto.randomUUID();
    const uploadSessionId = crypto.randomUUID();
    const researchPayload = {
      adultCount: 1,
      category: "flight",
      childCount: 0,
      currency: "USD",
      dayId: null,
      destinationPlaceId: null,
      destinationText: "NRT",
      endDate: null,
      endTime: null,
      itemId: null,
      journeyType: "one_way",
      links: [],
      locationPlaceId: null,
      locationText: null,
      note: "CloudBase collaborator",
      originPlaceId: null,
      originText: "SFO",
      roomCount: null,
      segments: [
        {
          carrier: "ANA",
          departureDate: "2026-10-04",
          destination: "NRT",
          origin: "SFO",
          serviceNumber: "NH 7",
        },
      ],
      sourceUrl: null,
      startDate: "2026-10-04",
      startTime: null,
      title: `${runLabel}-research`,
      totalPriceAmount: 800,
      tripId: aTrip,
    };
    dataOrThrow(
      await db.rpc("save_research_item_v3", {
        expected_version: null,
        requested_draft_session_id: null,
        requested_item: researchPayload,
        target_operation_id: crypto.randomUUID(),
        target_research_item_id: researchId,
        target_trip_id: aTrip,
      }),
      "B collaborator Research create",
    );
    const prepared = dataOrThrow(
      await db.rpc("prepare_research_asset_v2", {
        expected_research_version: 1,
        requested_byte_size: 128,
        requested_draft_session_id: uploadSessionId,
        requested_filename: "collaborator.pdf",
        requested_media_kind: "pdf",
        requested_mime_type: "application/pdf",
        requested_sha256: "a".repeat(64),
        target_research_item_id: researchId,
        target_trip_id: aTrip,
      }),
      "B collaborator Research attachment prepare",
    );
    dataOrThrow(
      await db.rpc("finalize_research_asset_v2", {
        expected_research_version: 1,
        target_asset_id: prepared.assetId,
        target_research_item_id: researchId,
        target_trip_id: aTrip,
        thumbnail_ready: false,
        verified_byte_size: 128,
        verified_media_kind: "pdf",
        verified_mime_type: "application/pdf",
        verified_sha256: "a".repeat(64),
      }),
      "B collaborator Research attachment finalize",
    );
    dataOrThrow(
      await db.rpc("save_research_item_v3", {
        expected_version: 1,
        requested_draft_session_id: uploadSessionId,
        requested_item: researchPayload,
        target_operation_id: crypto.randomUUID(),
        target_research_item_id: researchId,
        target_trip_id: aTrip,
      }),
      "B collaborator Research attachment commit",
    );
    const applied = dataOrThrow(
      await db.rpc("apply_research_item_to_variant_v3", {
        expected_research_version: 2,
        schedule_choice: "automatic",
        target_item_id: null,
        target_operation_id: crypto.randomUUID(),
        target_research_item_id: researchId,
        target_trip_id: aTrip,
        target_variant_id: aVariant,
      }),
      "B collaborator Research Apply",
    );
    if (applied?.status !== "applied") throw new Error("B Research Apply did not succeed");
    const reverted = dataOrThrow(
      await db.rpc("revert_research_plan_application_v2", {
        expected_version: 1,
        target_application_id: applied.applicationId,
        target_operation_id: crypto.randomUUID(),
        target_trip_id: aTrip,
      }),
      "B collaborator Research Revert",
    );
    if (reverted?.status !== "reverted") throw new Error("B Research Revert did not succeed");
    const collaboratorShare = await db.rpc("create_share_page_v4", {
      expected_variant_version: rows(
        await db.from("route_variants").select("version").eq("id", aVariant),
        "B share variant version",
      )[0].version,
      target_operation_id: crypto.randomUUID(),
      target_variant_id: aVariant,
    });
    dataOrThrow(collaboratorShare, "B collaborator Share Page create");
    dataOrThrow(await auth.signOut(), "B sign out");

    await signIn(auth, userA, config.CLOUDBASE_TEST_USER_A_PASSWORD);
    const staleUpdate = await db.rpc("update_trip_plan_v2", {
      target_trip_id: aTrip,
      trip_title: `${runLabel}-stale-owner-edit`,
      trip_start_date: null,
      trip_end_date: null,
      trip_day_count: 1,
      trip_timezone: "UTC",
      trip_currency: "USD",
      expected_version: sharedTripSnapshot.version,
      expected_content_version: sharedTripSnapshot.content_version,
      target_operation_id: crypto.randomUUID(),
    });
    if (!new Set(["40001", "DATABASE_40001"]).has(staleUpdate.error?.code))
      throw new Error(
        `A/B stale save did not return SQLSTATE 40001: ${JSON.stringify(staleUpdate.error)}`,
      );
    const latestSharedTrip = rows(
      await db.from("trips").select("version,content_version").eq("id", aTrip),
      "A local conflict reload",
    )[0];
    dataOrThrow(
      await db.rpc("update_trip_plan_v2", {
        target_trip_id: aTrip,
        trip_title: `${runLabel}-owner-after-reload`,
        trip_start_date: null,
        trip_end_date: null,
        trip_day_count: 1,
        trip_timezone: "UTC",
        trip_currency: "USD",
        expected_version: latestSharedTrip.version,
        expected_content_version: latestSharedTrip.content_version,
        target_operation_id: crypto.randomUUID(),
      }),
      "A save after local reload",
    );
    dataOrThrow(
      await db.rpc("remove_trip_collaborator", {
        target_member_id: invitedMemberId,
        target_operation_id: crypto.randomUUID(),
        target_trip_id: aTrip,
      }),
      "A owner removes collaborator C",
    );
    const own = rows(await db.from("trips").select("id,owner_id").eq("id", aTrip), "A own read");
    if (own.length !== 1 || own[0].owner_id !== aId) throw new Error("A own read mismatch");
    if (rows(await db.from("trips").select("id").eq("id", bTrip), "A cross read").length) {
      throw new Error("A read B's trip");
    }
    const crossUpdate = await db
      .from("trips")
      .update({ title: `${runLabel}-forbidden` })
      .eq("id", bTrip)
      .select("id");
    const crossDelete = await db.from("trips").delete().eq("id", bTrip).select("id");
    if (!crossUpdate.error || !crossDelete.error)
      throw new Error("Direct table DML did not fail closed");

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
    const crossRpc = await db.rpc("update_trip_plan_v2", {
      target_trip_id: bTrip,
      trip_title: `${runLabel}-rpc-forbidden`,
      trip_start_date: null,
      trip_end_date: null,
      trip_day_count: 1,
      trip_timezone: "UTC",
      trip_currency: "USD",
      expected_version: 1,
      expected_content_version: 1,
      target_operation_id: crypto.randomUUID(),
    });
    if (!crossRpc.error) throw new Error("A business RPC mutated B's trip");

    dataOrThrow(await auth.signOut(), "A sign out before public checks");
    await assertSignedOut(auth, "A sign out before anonymous checks");
    const anonymousPrivate = await db.from("trips").select("id").in("id", [aTrip, bTrip]);
    if (!anonymousPrivate.error && rows(anonymousPrivate, "anonymous private read").length) {
      throw new Error("Anonymous read private resources");
    }
    const projection = dataOrThrow(
      await db.rpc("get_public_share_page_v3", { shared_token: publicToken }),
      "anonymous immutable public snapshot",
    );
    assertPublicProjection(
      projection,
      `${runLabel}-published`,
      `${runLabel}-private-after-publish`,
      aId,
    );
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
  console.log("Immutable public snapshot and owner-private leak checks passed.");
  console.log("Both identities proved exact deletion and zero controlled/cascading fixtures.");
}

run().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : "CloudBase security test failed");
    process.exit(1);
  },
);
