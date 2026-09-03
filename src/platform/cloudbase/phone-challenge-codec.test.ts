import assert from "node:assert/strict";
import test from "node:test";

import {
  openFirstPhoneChallenge,
  openPhoneChallenge,
  sealPhoneChallenge,
} from "./phone-challenge-codec.ts";

const now = 1_800_000_000_000;
const challenge = {
  expiresAt: now + 10 * 60_000,
  isUser: false,
  issuedAt: now,
  phone: "+8613800138000",
  verificationId: "verification-123",
} as const;

test("round trips a valid encrypted phone challenge", () => {
  const sealed = sealPhoneChallenge(challenge, "test-secret");
  assert.deepEqual(openPhoneChallenge(sealed, "test-secret", now), challenge);
  assert.equal(sealed.includes(challenge.phone), false);
  assert.equal(sealed.includes(challenge.verificationId), false);
});

test("rejects tampered, wrongly keyed, and expired challenges", () => {
  const sealed = sealPhoneChallenge(challenge, "test-secret");
  assert.equal(openPhoneChallenge(`${sealed}x`, "test-secret", now), null);
  assert.equal(openPhoneChallenge(sealed, "other-secret", now), null);
  assert.equal(openPhoneChallenge(sealed, "test-secret", challenge.expiresAt), null);
});

test("recovers a valid action-state challenge when the cookie candidate is missing", () => {
  const sealed = sealPhoneChallenge(challenge, "test-secret");
  assert.deepEqual(openFirstPhoneChallenge([sealed, undefined], "test-secret", now), challenge);
});

test("prefers the latest action-state challenge and falls back to a valid cookie", () => {
  const oldChallenge = { ...challenge, verificationId: "verification-old" };
  const actionState = sealPhoneChallenge(challenge, "test-secret");
  const cookie = sealPhoneChallenge(oldChallenge, "test-secret");

  assert.deepEqual(openFirstPhoneChallenge([actionState, cookie], "test-secret", now), challenge);
  assert.deepEqual(
    openFirstPhoneChallenge(["invalid-action-state", cookie], "test-secret", now),
    oldChallenge,
  );
});
