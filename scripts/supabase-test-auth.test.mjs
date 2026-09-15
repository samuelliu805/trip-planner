import assert from "node:assert/strict";
import test from "node:test";

import { signInWithAdminMagicLink } from "./lib/supabase-test-auth.mjs";

test("establishes a controlled temporary-user session without password auth", async () => {
  const calls = [];
  const session = { access_token: "access", refresh_token: "refresh" };
  const admin = {
    auth: {
      admin: {
        async generateLink(input) {
          calls.push(["generate", input]);
          return {
            data: { properties: { hashed_token: "one-time-hash" } },
            error: null,
          };
        },
      },
    },
  };
  const client = {
    auth: {
      async verifyOtp(input) {
        calls.push(["verify", input]);
        return { data: { session, user: { id: "user-a" } }, error: null };
      },
    },
  };

  assert.equal(
    await signInWithAdminMagicLink({
      admin,
      client,
      email: "temporary@example.com",
      expectedUserId: "user-a",
    }),
    session,
  );
  assert.deepEqual(calls, [
    ["generate", { email: "temporary@example.com", type: "magiclink" }],
    ["verify", { token_hash: "one-time-hash", type: "magiclink" }],
  ]);
});

test("rejects a controlled session for a different user", async () => {
  const admin = {
    auth: {
      admin: {
        async generateLink() {
          return { data: { properties: { hashed_token: "one-time-hash" } }, error: null };
        },
      },
    },
  };
  const client = {
    auth: {
      async verifyOtp() {
        return {
          data: {
            session: { access_token: "access", refresh_token: "refresh" },
            user: { id: "unexpected-user" },
          },
          error: null,
        };
      },
    },
  };

  await assert.rejects(
    () =>
      signInWithAdminMagicLink({
        admin,
        client,
        email: "temporary@example.com",
        expectedUserId: "expected-user",
      }),
    /established the wrong user/,
  );
});
