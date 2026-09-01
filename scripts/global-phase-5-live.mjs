import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

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
  if (result.error) throw new Error(`${label}: ${result.error.code ?? "error"}`);
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
    await database.rpc("create_trip", {
      trip_currency: "USD",
      trip_day_count: 1,
      trip_end_date: null,
      trip_start_date: null,
      trip_timezone: "UTC",
      trip_title: title,
    }),
    "create_trip",
  );
  const created = rows(await database.from("trips").select("id").eq("title", title), "trip lookup");
  assert.equal(created.length, 1);
  return created[0].id;
}

async function updateTrip(database, tripId, title) {
  ok(
    await database.rpc("update_trip_plan", {
      target_trip_id: tripId,
      trip_currency: "USD",
      trip_day_count: 1,
      trip_end_date: null,
      trip_start_date: null,
      trip_timezone: "UTC",
      trip_title: title,
    }),
    "update_trip_plan",
  );
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
  let failure;

  try {
    for (const label of ["A", "B"]) {
      const email = `${runLabel}-${label.toLowerCase()}@example.com`;
      const user = ok(
        await admin.auth.admin.createUser({ email, email_confirm: true, password }),
        `create user ${label}`,
      ).user;
      assert.ok(user?.id);
      entries.push({ client: client(url, publishableKey), email, id: user.id, label });
    }
    const [userA, userB] = entries;
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
    const aTrip = await createTrip(userA.client, `${runLabel}-a`);
    tripIds.push(aTrip);
    await updateTrip(userA.client, aTrip, intendedTitle);
    const ownUpdate = rows(
      await userA.client.from("trips").update({ status: "done" }).eq("id", aTrip).select("id"),
      "A own update",
    );
    assert.deepEqual(
      ownUpdate.map(({ id }) => id),
      [aTrip],
    );
    const variant = rows(
      await userA.client
        .from("route_variants")
        .select("id")
        .eq("trip_id", aTrip)
        .eq("is_primary", true),
      "A primary variant",
    )[0];
    assert.ok(variant?.id);
    const share = ok(
      await userA.client.rpc("create_share_page_v3", { target_variant_id: variant.id }),
      "A publish immutable share",
    );
    assert.ok(share?.publicToken);
    await updateTrip(userA.client, aTrip, privateTitle);
    ok(await userA.client.auth.signOut(), "A logout");
    assert.equal((await userA.client.auth.getSession()).data.session, null);

    await signIn(userB, password);
    const bTrip = await createTrip(userB.client, `${runLabel}-b`);
    tripIds.push(bTrip);
    const crossPublish = await userB.client.rpc("create_share_page_v3", {
      target_variant_id: variant.id,
    });
    assert.ok(crossPublish.error, "B published A's variant");
    ok(await userB.client.auth.signOut(), "B logout");

    await signIn(userA, password);
    assert.equal(
      rows(await userA.client.from("trips").select("id").eq("id", bTrip), "A cross read").length,
      0,
    );
    assert.equal(
      rows(
        await userA.client
          .from("trips")
          .update({ title: `${runLabel}-forged` })
          .eq("id", bTrip)
          .select("id"),
        "A cross update",
      ).length,
      0,
    );
    assert.equal(
      rows(await userA.client.from("trips").delete().eq("id", bTrip).select("id"), "A cross delete")
        .length,
      0,
    );
    assert.ok(
      (
        await userA.client.rpc("update_trip_plan", {
          target_trip_id: bTrip,
          trip_currency: "USD",
          trip_day_count: 1,
          trip_end_date: null,
          trip_start_date: null,
          trip_timezone: "UTC",
          trip_title: `${runLabel}-rpc-forged`,
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
    const anonymousTrips = await anonymous.from("trips").select("id").in("id", tripIds);
    assert.ok(anonymousTrips.error || rows(anonymousTrips, "anonymous trips").length === 0);
    const projection = ok(
      await anonymous.rpc("get_public_share_page_v3", { shared_token: share.publicToken }),
      "anonymous immutable snapshot",
    );
    assertPublicProjection(projection, intendedTitle, privateTitle, userA.id);
    if (process.env.PHASE5_REQUIRE_BROWSER_SMOKE === "1") {
      await runGlobalBrowserSmoke({
        email: userA.email,
        intendedTitle,
        password,
        privateTitle,
        publicToken: share.publicToken,
        tripId: aTrip,
      });
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
      if (tripIds.length) ok(await admin.from("trips").delete().in("id", tripIds), "trip cleanup");
      for (const entry of entries) ok(await admin.auth.admin.deleteUser(entry.id), "user cleanup");
      const ownerIds = entries.map(({ id }) => id);
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
