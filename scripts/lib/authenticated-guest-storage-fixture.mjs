import assert from "node:assert/strict";
import { createGuestTripFixture } from "./guest-trip-fixture.mjs";

export function authenticatedGuestStorageFixture(mode = "confirmed") {
  const entries = {};
  for (const region of ["global", "cn"]) {
    const { payload, draftId } = createGuestTripFixture(region, "authenticated-cleanup");
    const intent = { action: "save", createdAt: payload.createdAt, draftId };
    const marker = {
      draftId,
      revision: mode === "newer" ? payload.revision - 1 : payload.revision,
      importedAt: payload.updatedAt,
      intent,
      tripId: draftId,
    };
    const prefix = `trip-planner:guest-trip:${region}`;
    entries[`${prefix}:active`] =
      mode === "corrupt" ? "{broken-guest-recovery" : JSON.stringify(payload);
    entries[`${prefix}:intent`] = JSON.stringify(intent);
    entries[`${prefix}:imported`] = JSON.stringify(marker);
  }
  return entries;
}

export async function verifyUnconfirmedGuestPreservation({ evaluate, visit, waitFor }) {
  for (const mode of ["newer", "corrupt"]) {
    const entries = authenticatedGuestStorageFixture(mode);
    await evaluate(
      `Object.entries(${JSON.stringify(entries)}).forEach(([key,value]) => localStorage.setItem(key,value)); true`,
    );
    await visit();
    await waitFor(
      "location.pathname === '/trips' && document.readyState === 'complete'",
      `authenticated ${mode} Guest redirect`,
    );
    await evaluate("new Promise(resolve => setTimeout(resolve, 500))");
    const actual = await evaluate(
      `Object.fromEntries(${JSON.stringify(Object.keys(entries))}.map(key => [key,localStorage.getItem(key)]))`,
    );
    assert.deepEqual(
      actual,
      entries,
      `${mode} Guest data survives login without a matching revision receipt`,
    );
    await evaluate(
      `${JSON.stringify(Object.keys(entries))}.forEach(key => localStorage.removeItem(key)); true`,
    );
  }
}
