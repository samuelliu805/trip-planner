import assert from "node:assert/strict";
import test from "node:test";

import { PlatformOperationError } from "../contracts/errors.ts";
import { saveCloudBaseProfile } from "./profile-mutations.ts";
import {
  removeCloudBaseTrip,
  renameCloudBaseTripIfTitle,
  setCloudBaseTripStatus,
} from "./trip-mutations.ts";
import type { CloudBaseDatabase } from "./client.ts";
import type { CloudBaseAuthClient } from "./client.ts";
import { normalizeCloudBaseError } from "./errors.ts";
import { restoreCloudBaseAuthSession } from "./session-runtime.ts";

type FakeResult = { data: unknown; error: unknown };

class FakeQuery {
  filters: Array<[string, unknown]> = [];
  operation = "select";
  selection = "*";
  values: unknown;
  readonly table: string;
  private readonly result: (query: FakeQuery) => FakeResult;

  constructor(table: string, result: (query: FakeQuery) => FakeResult) {
    this.table = table;
    this.result = result;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }

  insert(values: unknown) {
    this.operation = "insert";
    this.values = values;
    return this;
  }

  select(columns = "*") {
    this.selection = columns;
    return this;
  }

  update(values: unknown) {
    this.operation = "update";
    this.values = values;
    return this;
  }

  upsert(values: unknown) {
    this.operation = "upsert";
    this.values = values;
    return this;
  }

  then(resolve: (value: FakeResult) => unknown, reject?: (reason: unknown) => unknown) {
    return Promise.resolve(this.result(this)).then(resolve, reject);
  }
}

function database(result: (query: FakeQuery) => FakeResult) {
  return {
    from(table: string) {
      return new FakeQuery(table, result);
    },
    rpc() {
      throw new Error("RPC was not expected in this behavior test.");
    },
  } as unknown as CloudBaseDatabase;
}

function trip(overrides: Record<string, unknown> = {}) {
  return {
    created_at: "2026-08-31T00:00:00.000Z",
    currency: "USD",
    day_count: 3,
    end_date: null,
    id: "trip-a",
    owner_id: "user-a",
    start_date: null,
    status: "open",
    timezone: "America/Los_Angeles",
    title: "Before",
    updated_at: "2026-08-31T00:00:00.000Z",
    ...overrides,
  };
}

test("CloudBase status returns the actual updated row and scopes by server user", async () => {
  const db = database((query) => {
    assert.equal(query.table, "trips");
    assert.equal(query.operation, "update");
    assert.deepEqual(query.values, { status: "done" });
    assert.deepEqual(query.filters, [
      ["id", "trip-a"],
      ["owner_id", "user-a"],
    ]);
    assert.equal(query.selection, "*");
    return { data: [trip({ status: "done", updated_at: "database-time" })], error: null };
  });

  const updated = await setCloudBaseTripStatus(db, "user-a", "trip-a", "done");
  assert.equal(updated.status, "done");
  assert.equal(updated.updated_at, "database-time");
});

test("CloudBase status rejects a zero-row update", async () => {
  await assert.rejects(
    () =>
      setCloudBaseTripStatus(
        database(() => ({ data: [], error: null })),
        "user-a",
        "x",
        "done",
      ),
    (error) => error instanceof PlatformOperationError && error.code === "forbidden",
  );
});

test("CloudBase status preserves a database permission error", async () => {
  await assert.rejects(
    () =>
      setCloudBaseTripStatus(
        database(() => ({ data: null, error: { code: "42501", message: "permission denied" } })),
        "user-a",
        "trip-a",
        "done",
      ),
    (error) => error instanceof PlatformOperationError && error.code === "forbidden",
  );
});

test("CloudBase conditional rename reports success only for an affected row", async () => {
  assert.equal(
    await renameCloudBaseTripIfTitle(
      database((query) => {
        assert.deepEqual(query.filters, [
          ["id", "trip-a"],
          ["owner_id", "user-a"],
          ["title", "Before"],
        ]);
        return { data: [{ id: "trip-a" }], error: null };
      }),
      "user-a",
      "trip-a",
      "Before",
      "After",
    ),
    true,
  );
});

test("CloudBase conditional rename returns false after a concurrent title change", async () => {
  assert.equal(
    await renameCloudBaseTripIfTitle(
      database(() => ({ data: [], error: null })),
      "user-a",
      "trip-a",
      "Before",
      "After",
    ),
    false,
  );
});

test("CloudBase conditional rename preserves permission errors", async () => {
  await assert.rejects(
    () =>
      renameCloudBaseTripIfTitle(
        database(() => ({ data: null, error: { code: "42501", message: "permission denied" } })),
        "user-a",
        "trip-a",
        "Before",
        "After",
      ),
    (error) => error instanceof PlatformOperationError && error.code === "forbidden",
  );
});

test("CloudBase deletion rejects a zero-row mutation", async () => {
  await assert.rejects(
    () =>
      removeCloudBaseTrip(
        database(() => ({ data: [], error: null })),
        "user-a",
        "trip-a",
      ),
    (error) => error instanceof PlatformOperationError && error.code === "not_found",
  );
});

test("CloudBase profile save returns the database row", async () => {
  const saved = await saveCloudBaseProfile(
    database(() => ({
      data: [{ default_currency: "EUR", home_city: "Paris", id: "user-a", preferred_locale: "fr" }],
      error: null,
    })),
    "user-a",
    {
      defaultCurrency: "USD",
      homeCity: "Paris",
      preferredLocale: "fr",
    },
  );
  assert.deepEqual(saved, {
    defaultCurrency: "EUR",
    homeCity: "Paris",
    preferredLocale: "fr",
  });
});

test("CloudBase profile save rejects zero rows and permission errors", async () => {
  const input = { defaultCurrency: "USD", homeCity: null, preferredLocale: "en" };
  await assert.rejects(
    () =>
      saveCloudBaseProfile(
        database(() => ({ data: [], error: null })),
        "user-a",
        input,
      ),
    (error) => error instanceof PlatformOperationError && error.code === "unexpected",
  );
  await assert.rejects(
    () =>
      saveCloudBaseProfile(
        database(() => ({ data: null, error: { code: "42501", message: "permission denied" } })),
        "user-a",
        input,
      ),
    (error) => error instanceof PlatformOperationError && error.code === "forbidden",
  );
});

function authSessionData(accessToken = "access", refreshToken = "refresh") {
  return {
    session: {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: { id: "user-a", user_metadata: { username: "trip-planner-cn-test-a" } },
    },
  };
}

test("CloudBase session restore proves an established session with getSession", async () => {
  const calls: string[] = [];
  const auth = {
    async setSession() {
      calls.push("setSession");
      return { data: {}, error: null };
    },
    async getSession() {
      calls.push("getSession");
      return { data: authSessionData(), error: null };
    },
    async refreshSession() {
      calls.push("refreshSession");
      throw new Error("refresh was not expected");
    },
  } as unknown as CloudBaseAuthClient;
  const restored = await restoreCloudBaseAuthSession(auth, {
    accessToken: "access",
    refreshToken: "refresh",
  });
  assert.equal(restored.session.user.id, "user-a");
  assert.equal(restored.refreshed, false);
  assert.deepEqual(calls, ["setSession", "getSession"]);
});

test("CloudBase session restore refreshes an expired access token then verifies it", async () => {
  const calls: string[] = [];
  let setCount = 0;
  const auth = {
    async setSession() {
      calls.push("setSession");
      setCount += 1;
      return setCount === 1
        ? { data: null, error: { message: "jwt expired" } }
        : { data: {}, error: null };
    },
    async getSession() {
      calls.push("getSession");
      return { data: authSessionData("renewed", "renewed-refresh"), error: null };
    },
    async refreshSession() {
      calls.push("refreshSession");
      return { data: authSessionData("renewed", "renewed-refresh"), error: null };
    },
  } as unknown as CloudBaseAuthClient;
  const restored = await restoreCloudBaseAuthSession(auth, {
    accessToken: "expired",
    refreshToken: "refresh",
  });
  assert.equal(restored.session.accessToken, "renewed");
  assert.equal(restored.refreshed, true);
  assert.deepEqual(calls, ["setSession", "refreshSession", "setSession", "getSession"]);
});

test("CloudBase refresh failure and CAPTCHA map to shared safe errors", async () => {
  const auth = {
    async setSession() {
      return { data: null, error: { message: "jwt expired" } };
    },
    async refreshSession() {
      return { data: null, error: { message: "invalid_grant" } };
    },
  } as unknown as CloudBaseAuthClient;
  await assert.rejects(
    () =>
      restoreCloudBaseAuthSession(auth, {
        accessToken: "expired",
        refreshToken: "expired-refresh",
      }),
    (error) => error instanceof PlatformOperationError && error.code === "authentication_required",
  );
  const captcha = normalizeCloudBaseError(
    { code: "4001", message: "captcha required" },
    "Authentication failed.",
  );
  assert.equal(captcha.code, "captcha_required");
  assert.equal(captcha.message, "Complete the security check, then try again.");
});

test("CloudBase SMS failures map to bounded errors without phone or OTP leakage", () => {
  const phone = "+8613800138000";
  const code = "123456";
  const cases = [
    [{ message: `too many requests for ${phone}` }, "rate_limited"],
    [{ category: "VERIFICATION_FAILED", code: "invalid_argument" }, "otp_invalid"],
    [{ message: `verification expired ${code}` }, "otp_expired"],
    [{ message: `verification code already used ${code}` }, "otp_invalid"],
  ] as const;

  for (const [providerError, expectedCode] of cases) {
    const normalized = normalizeCloudBaseError(providerError, "Phone sign-in failed.");
    assert.equal(normalized.code, expectedCode);
    assert.equal(normalized.message.includes(phone), false);
    assert.equal(normalized.message.includes(code), false);
    assert.equal(normalized.cause, undefined);
  }
});
