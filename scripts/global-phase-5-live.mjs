import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { createGuestTripFixture } from "./lib/guest-trip-fixture.mjs";
import { runGlobalBrowserSmoke } from "./lib/phase-5-global-browser-smoke.mjs";

const runLabel = `phase5-global-${Date.now()}-${randomUUID()}`;
const timeoutMilliseconds = 20_000;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required Phase 5 configuration: ${name}`);
  return value;
}

function client(url, key) {
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function ok(result, label) {
  if (result.error)
    throw new Error(
      `${label}: ${result.error.code ?? "error"} ${String(result.error.message ?? "").slice(0, 240)}`,
    );
  return result.data;
}

function rows(result, label) {
  const data = ok(result, label);
  return Array.isArray(data) ? data : data == null ? [] : [data];
}

async function bounded(label, operation) {
  let timer;
  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMilliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function signIn(entry, password) {
  const data = ok(
    await bounded(`${entry.label} sign-in`, () =>
      entry.client.auth.signInWithPassword({ email: entry.email, password }),
    ),
    `${entry.label} sign-in`,
  );
  assert.equal(data.user?.id, entry.id);
  assert.ok(data.session?.access_token && data.session.refresh_token);
  return data.session;
}

async function createTrip(database, title) {
  ok(
    await database.rpc("create_trip_v3", {
      trip_currency: "USD",
      trip_day_count: 1,
      trip_end_date: null,
      trip_locale: "en",
      trip_start_date: null,
      trip_timezone: "UTC",
      trip_title: title,
      target_operation_id: randomUUID(),
    }),
    "create_trip",
  );
  const created = rows(await database.from("trips").select("id").eq("title", title), "trip lookup");
  assert.equal(created.length, 1);
  return created[0].id;
}

async function updateTrip(database, tripId, title, expectedVersion) {
  const current = rows(
    await database.from("trips").select("content_version").eq("id", tripId),
    "trip content version",
  )[0];
  ok(
    await database.rpc("update_trip_plan_v2", {
      target_trip_id: tripId,
      trip_currency: "USD",
      trip_day_count: 1,
      trip_end_date: null,
      trip_start_date: null,
      trip_timezone: "UTC",
      trip_title: title,
      expected_version: expectedVersion,
      expected_content_version: current.content_version,
      target_operation_id: randomUUID(),
    }),
    "update_trip_plan_v2",
  );
}

async function verifyGuestImport(database, ownerId) {
  const fixture = createGuestTripFixture("global", runLabel);
  fixture.payload.trip.owner_id = "untrusted-client-owner";
  const parameters = {
    guest_draft_id: fixture.draftId,
    guest_locale: "en",
    guest_payload: fixture.payload,
  };
  const firstId = ok(await database.rpc("import_guest_trip_v1", parameters), "guest import");
  const replayId = ok(
    await database.rpc("import_guest_trip_v1", parameters),
    "guest import replay",
  );
  assert.equal(replayId, firstId, "Guest import replay created a different Trip.");

  const [trips, variants, days, items, places, links] = await Promise.all([
    database.from("trips").select("id,owner_id,title,guest_draft_id").eq("id", firstId),
    database.from("route_variants").select("id,name").eq("trip_id", firstId),
    database.from("trip_days").select("id,title,notes").eq("variant_id", fixture.variantId),
    database
      .from("itinerary_items")
      .select("id,title,notes,price_amount,price_currency,place_id")
      .eq("trip_id", firstId)
      .order("sort_order"),
    database
      .from("places")
      .select("id,source,provider_place_id,coordinate_system")
      .eq("trip_id", firstId),
    database.from("itinerary_item_links").select("id,label,url").eq("item_id", fixture.itemId),
  ]).then((results) =>
    results.map((result, index) => rows(result, `guest import evidence ${index + 1}`)),
  );
  assert.deepEqual(trips, [
    { guest_draft_id: fixture.draftId, id: firstId, owner_id: ownerId, title: fixture.title },
  ]);
  assert.deepEqual(variants, [{ id: fixture.variantId, name: "Main plan" }]);
  assert.deepEqual(days, [{ id: fixture.dayId, notes: "Guest day note", title: "Arrival" }]);
  assert.deepEqual(items, [
    {
      id: fixture.itemId,
      notes: "Guest import fixture",
      place_id: fixture.placeId,
      price_amount: 42.5,
      price_currency: "USD",
      title: `${runLabel} activity`,
    },
    {
      id: fixture.duplicateItemId,
      notes: "Repeated provider place fixture",
      place_id: fixture.placeId,
      price_amount: null,
      price_currency: null,
      title: `${runLabel} repeated activity`,
    },
  ]);
  assert.deepEqual(places, [
    {
      coordinate_system: "wgs84",
      id: fixture.placeId,
      provider_place_id: fixture.providerPlaceId,
      source: "google",
    },
  ]);
  assert.deepEqual(links, [
    { id: fixture.linkId, label: "Details", url: "https://example.com/details" },
  ]);
  return { ...fixture, tripId: firstId };
}

async function requireProviderNeutralPlaceSchema(database) {
  const result = await database
    .from("places")
    .select("source,provider_place_id,coordinate_system")
    .limit(1);
  if (result.error) {
    throw new Error(
      `Controlled Supabase dev is missing the Phase 5 provider-neutral place schema: ${result.error.code ?? "schema_error"}`,
    );
  }
}

function assertPublicProjection(projection, intendedTitle, privateTitle, ownerId) {
  assert.equal(projection?.available, true);
  const serialized = JSON.stringify(projection);
  assert.match(serialized, new RegExp(intendedTitle));
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
    "GOOGLE_ROUTES_API_KEY",
    "SUPABASE_SECRET_KEY",
    "tp-cn-access-token",
    "sb-access-token",
  ]) {
    assert.equal(serialized.includes(forbidden), false, `public snapshot leaked ${forbidden}`);
  }
}

async function run() {
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey = required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const secretKey = required("SUPABASE_SECRET_KEY");
  const admin = client(url, secretKey);
  const password = `${randomBytes(24).toString("base64url")}aA1!`;
  const entries = [];
  const tripIds = [];
  let guestFixture;
  let failure;

  try {
    await requireProviderNeutralPlaceSchema(admin);
    for (const label of ["A", "B", "C"]) {
      const email = `${runLabel}-${label.toLowerCase()}@example.com`;
      const user = ok(
        await admin.auth.admin.createUser({ email, email_confirm: true, password }),
        `create user ${label}`,
      ).user;
      assert.ok(user?.id);
      entries.push({ client: client(url, publishableKey), email, id: user.id, label });
    }
    const [userA, userB, userC] = entries;
    const firstSession = await signIn(userA, password);
    const restored = ok(
      await userA.client.auth.setSession({
        access_token: firstSession.access_token,
        refresh_token: firstSession.refresh_token,
      }),
      "session restore",
    );
    assert.equal(restored.user?.id, userA.id);
    const refreshed = ok(
      await userA.client.auth.refreshSession({ refresh_token: firstSession.refresh_token }),
      "session refresh",
    );
    assert.equal(refreshed.user?.id, userA.id);

    const intendedTitle = `${runLabel}-published`;
    const privateTitle = `${runLabel}-private-after-publish`;
    const collaboratorTitle = `${runLabel}-collaborator-edit`;
    const aTrip = await createTrip(userA.client, `${runLabel}-a`);
    tripIds.push(aTrip);
    await updateTrip(userA.client, aTrip, intendedTitle, 1);
    ok(
      await userA.client.rpc("update_trip_status", {
        expected_version: 2,
        target_operation_id: randomUUID(),
        target_status: "done",
        target_trip_id: aTrip,
      }),
      "A own update",
    );
    const variant = rows(
      await userA.client
        .from("route_variants")
        .select("id,version")
        .eq("trip_id", aTrip)
        .eq("is_primary", true),
      "A primary variant",
    )[0];
    assert.ok(variant?.id);
    const share = ok(
      await userA.client.rpc("create_share_page_v4", {
        expected_variant_version: variant.version,
        target_operation_id: randomUUID(),
        target_variant_id: variant.id,
      }),
      "A publish immutable share",
    );
    assert.ok(share?.publicToken);
    await updateTrip(userA.client, aTrip, privateTitle, 3);
    assert.equal(
      ok(
        await userA.client.rpc("invite_trip_collaborator", {
          target_identifier: userB.email,
          target_operation_id: randomUUID(),
          target_trip_id: aTrip,
        }),
        "A email invitation for B",
      ),
      true,
    );
    assert.equal(
      ok(
        await userA.client.rpc("invite_trip_collaborator", {
          target_identifier: `${runLabel}-missing@example.com`,
          target_operation_id: randomUUID(),
          target_trip_id: aTrip,
        }),
        "unregistered email invitation",
      ),
      false,
    );
    ok(await userA.client.auth.signOut(), "A logout");
    assert.equal((await userA.client.auth.getSession()).data.session, null);

    await signIn(userB, password);
    const bTrip = await createTrip(userB.client, `${runLabel}-b`);
    tripIds.push(bTrip);
    const collaboratorTrip = rows(
      await userB.client.from("trips").select("id,version,content_version").eq("id", aTrip),
      "B collaborator Trips visibility",
    )[0];
    assert.ok(collaboratorTrip);
    const bMembership = rows(
      await userB.client
        .from("trip_members")
        .select("id,role")
        .eq("trip_id", aTrip)
        .eq("user_id", userB.id),
      "B collaborator role",
    )[0];
    assert.equal(bMembership?.role, "collaborator");
    ok(
      await userB.client.rpc("update_trip_plan_v2", {
        target_trip_id: aTrip,
        trip_currency: "USD",
        trip_day_count: 1,
        trip_end_date: null,
        trip_start_date: null,
        trip_timezone: "UTC",
        trip_title: collaboratorTitle,
        expected_version: collaboratorTrip.version,
        expected_content_version: collaboratorTrip.content_version,
        target_operation_id: randomUUID(),
      }),
      "B collaborator trip edit",
    );
    const bConflictSnapshot = rows(
      await userB.client.from("trips").select("version").eq("id", aTrip),
      "B optimistic-lock snapshot",
    )[0];
    await signIn(userA, password);
    ok(
      await userA.client.rpc("update_trip_status", {
        expected_version: bConflictSnapshot.version,
        target_operation_id: randomUUID(),
        target_status: "open",
        target_trip_id: aTrip,
      }),
      "A wins optimistic-lock race",
    );
    const committedWinner = rows(
      await userB.client.from("trips").select("version").eq("id", aTrip),
      "B observes A committed winner",
    )[0];
    assert.ok(committedWinner.version > bConflictSnapshot.version);
    const staleUpdate = await userB.client.rpc("update_trip_status", {
      expected_version: bConflictSnapshot.version,
      target_operation_id: randomUUID(),
      target_status: "done",
      target_trip_id: aTrip,
    });
    assert.equal(staleUpdate.error?.code, "40001", "B stale save did not return SQLSTATE 40001");
    const latestAfterConflict = rows(
      await userB.client.from("trips").select("version").eq("id", aTrip),
      "B local conflict reload",
    )[0];
    ok(
      await userB.client.rpc("update_trip_status", {
        expected_version: latestAfterConflict.version,
        target_operation_id: randomUUID(),
        target_status: "done",
        target_trip_id: aTrip,
      }),
      "B save after local reload",
    );
    assert.equal(
      ok(
        await userB.client.rpc("invite_trip_collaborator", {
          target_identifier: userC.email,
          target_operation_id: randomUUID(),
          target_trip_id: aTrip,
        }),
        "B collaborator invitation for C",
      ),
      true,
    );
    const cMember = rows(
      await userB.client
        .from("trip_members")
        .select("id")
        .eq("trip_id", aTrip)
        .eq("user_id", userC.id),
      "C membership",
    )[0];
    assert.ok(cMember?.id);
    assert.ok(
      (
        await userB.client.rpc("remove_trip_collaborator", {
          target_member_id: cMember.id,
          target_operation_id: randomUUID(),
          target_trip_id: aTrip,
        })
      ).error,
      "B removed collaborator C",
    );
    assert.ok(
      (
        await userB.client.rpc("delete_trip_v3", {
          expected_content_version: collaboratorTrip.content_version,
          expected_version: collaboratorTrip.version,
          target_operation_id: randomUUID(),
          target_trip_id: aTrip,
        })
      ).error,
      "B deleted A's shared Trip",
    );

    const researchId = randomUUID();
    const uploadSessionId = randomUUID();
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
      note: "Global collaborator",
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
    ok(
      await userB.client.rpc("save_research_item_v3", {
        expected_version: null,
        requested_draft_session_id: null,
        requested_item: researchPayload,
        target_operation_id: randomUUID(),
        target_research_item_id: researchId,
        target_trip_id: aTrip,
      }),
      "B collaborator Research create",
    );
    const prepared = ok(
      await userB.client.rpc("prepare_research_asset_v2", {
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
    ok(
      await userB.client.rpc("finalize_research_asset_v2", {
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
    ok(
      await userB.client.rpc("save_research_item_v3", {
        expected_version: 1,
        requested_draft_session_id: uploadSessionId,
        requested_item: researchPayload,
        target_operation_id: randomUUID(),
        target_research_item_id: researchId,
        target_trip_id: aTrip,
      }),
      "B collaborator Research attachment commit",
    );
    const applied = ok(
      await userB.client.rpc("apply_research_item_to_variant_v3", {
        expected_research_version: 2,
        schedule_choice: "automatic",
        target_item_id: null,
        target_operation_id: randomUUID(),
        target_research_item_id: researchId,
        target_trip_id: aTrip,
        target_variant_id: variant.id,
      }),
      "B collaborator Research Apply",
    );
    assert.equal(applied.status, "applied");
    const reverted = ok(
      await userB.client.rpc("revert_research_plan_application_v2", {
        expected_version: 1,
        target_application_id: applied.applicationId,
        target_operation_id: randomUUID(),
        target_trip_id: aTrip,
      }),
      "B collaborator Research Revert",
    );
    assert.equal(reverted.status, "reverted");
    const collaboratorShare = ok(
      await userB.client.rpc("create_share_page_v4", {
        expected_variant_version: rows(
          await userB.client.from("route_variants").select("version").eq("id", variant.id),
          "B share variant version",
        )[0].version,
        target_operation_id: randomUUID(),
        target_variant_id: variant.id,
      }),
      "B collaborator Share Page create",
    );
    assert.ok(collaboratorShare.publicToken);
    ok(await userB.client.auth.signOut(), "B logout");

    ok(
      await userA.client.rpc("remove_trip_collaborator", {
        target_member_id: cMember.id,
        target_operation_id: randomUUID(),
        target_trip_id: aTrip,
      }),
      "A owner removes collaborator C",
    );
    guestFixture = await verifyGuestImport(userA.client, userA.id);
    tripIds.push(guestFixture.tripId);
    assert.equal(
      rows(await userA.client.from("trips").select("id").eq("id", bTrip), "A cross read").length,
      0,
    );
    assert.ok(
      (
        await userA.client
          .from("trips")
          .update({ title: `${runLabel}-forged` })
          .eq("id", bTrip)
          .select("id")
      ).error,
      "authenticated direct UPDATE must be privilege denied",
    );
    assert.ok(
      (await userA.client.from("trips").delete().eq("id", bTrip).select("id")).error,
      "authenticated direct DELETE must be privilege denied",
    );
    assert.ok(
      (
        await userA.client.rpc("update_trip_plan_v2", {
          target_trip_id: bTrip,
          trip_currency: "USD",
          trip_day_count: 1,
          trip_end_date: null,
          trip_start_date: null,
          trip_timezone: "UTC",
          trip_title: `${runLabel}-rpc-forged`,
          expected_version: 1,
          expected_content_version: 1,
          target_operation_id: randomUUID(),
        })
      ).error,
      "A invoked an owner RPC against B",
    );
    assert.ok(
      (
        await userA.client.from("trips").insert({
          currency: "USD",
          day_count: 1,
          owner_id: userB.id,
          status: "open",
          timezone: "UTC",
          title: `${runLabel}-owner-forged`,
        })
      ).error,
      "A forged owner_id",
    );
    ok(await userA.client.auth.signOut(), "A final logout");

    const anonymous = client(url, publishableKey);
    assert.ok(
      (
        await anonymous.rpc("import_guest_trip_v1", {
          guest_draft_id: guestFixture.draftId,
          guest_locale: "en",
          guest_payload: guestFixture.payload,
        })
      ).error,
      "Anonymous client invoked guest import.",
    );
    const anonymousTrips = await anonymous.from("trips").select("id").in("id", tripIds);
    assert.ok(anonymousTrips.error || rows(anonymousTrips, "anonymous trips").length === 0);
    const projection = ok(
      await anonymous.rpc("get_public_share_page_v3", { shared_token: share.publicToken }),
      "anonymous immutable snapshot",
    );
    assertPublicProjection(projection, intendedTitle, privateTitle, userA.id);
    if (process.env.PHASE5_REQUIRE_BROWSER_SMOKE === "1") {
      const guestTripId = await runGlobalBrowserSmoke({
        authenticatedTitle: collaboratorTitle,
        email: userA.email,
        intendedTitle: collaboratorTitle,
        password,
        privateTitle,
        publicToken: collaboratorShare.publicToken,
        tripId: aTrip,
      });
      if (guestTripId) tripIds.push(guestTripId);
    }
    const expired = await anonymous.auth.setSession({
      access_token: "expired.invalid.token",
      refresh_token: "expired-invalid-refresh",
    });
    assert.ok(expired.error || !expired.data.session, "expired tokens established a session");
  } catch (error) {
    failure = error;
  } finally {
    try {
      const ownerIds = entries.map(({ id }) => id);
      if (ownerIds.length)
        ok(await admin.from("trips").delete().in("owner_id", ownerIds), "trip cleanup");
      for (const entry of entries) ok(await admin.auth.admin.deleteUser(entry.id), "user cleanup");
      const tripResidue = ownerIds.length
        ? ((
            await admin
              .from("trips")
              .select("id", { count: "exact", head: true })
              .in("owner_id", ownerIds)
          ).count ?? 0)
        : 0;
      const userResidue = await Promise.all(
        entries.map(({ id }) =>
          admin.auth.admin.getUserById(id).then(({ data }) => Number(Boolean(data.user))),
        ),
      );
      const residue = {
        temporaryUsers: userResidue.reduce((sum, value) => sum + value, 0),
        trips: tripResidue,
      };
      process.stdout.write(`Global Phase 5 residue audit: ${JSON.stringify(residue)}.\n`);
      assert.deepEqual(residue, { temporaryUsers: 0, trips: 0 });
    } catch (cleanupError) {
      failure = failure
        ? new AggregateError(
            [failure, cleanupError],
            "Global live suite failed and residue remains",
          )
        : cleanupError;
    }
  }
  if (failure) throw failure;
  process.stdout.write(
    "Global Phase 5 Auth, CRUD, RPC, A/B RLS, immutable sharing, and zero-residue checks passed.\n",
  );
}

await run();
