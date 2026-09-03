import assert from "node:assert/strict";
import test from "node:test";

import {
  completeCloudBasePhoneOtp,
  requestCloudBasePhoneOtp,
  type CloudBasePhoneAuthClient,
} from "./phone-otp-runtime.ts";

function mockClient(options: { isUser: boolean; token?: string }) {
  const calls: Array<{ input: unknown; method: string }> = [];
  const client: CloudBasePhoneAuthClient = {
    async getVerification(input) {
      calls.push({ input, method: "getVerification" });
      return { is_user: options.isUser, verification_id: "challenge-id" };
    },
    async signInWithSms(input) {
      calls.push({ input, method: "signInWithSms" });
    },
    async signUp(input) {
      calls.push({ input, method: "signUp" });
    },
    async verify(input) {
      calls.push({ input, method: "verify" });
      return { verification_token: options.token };
    },
  };
  return { calls, client };
}

const baseChallenge = {
  expiresAt: Date.now() + 600_000,
  issuedAt: Date.now(),
  phone: "+8613800138000",
  verificationId: "challenge-id",
} as const;

test("requests an OTP through the pinned CloudBase legacy challenge surface", async () => {
  const { calls, client } = mockClient({ isUser: true });
  assert.deepEqual(await requestCloudBasePhoneOtp(client, baseChallenge.phone), {
    isUser: true,
    verificationId: "challenge-id",
  });
  assert.deepEqual(calls, [
    { input: { phone_number: "+86 13800138000" }, method: "getVerification" },
  ]);
});

test("fails closed when CloudBase returns a malformed challenge", async () => {
  const { client } = mockClient({ isUser: true });
  const malformed = {
    ...client,
    async getVerification() {
      return { is_user: true };
    },
  };
  await assert.rejects(
    () => requestCloudBasePhoneOtp(malformed, baseChallenge.phone),
    (error) => error instanceof Error && !error.message.includes(baseChallenge.phone),
  );
});

test("signs in an existing user without exposing the challenge outside the adapter", async () => {
  const { calls, client } = mockClient({ isUser: true });
  await completeCloudBasePhoneOtp(client, { ...baseChallenge, isUser: true }, "123456");
  assert.deepEqual(
    calls.map(({ method }) => method),
    ["signInWithSms"],
  );
  assert.deepEqual(calls[0]?.input, {
    phoneNum: "+86 13800138000",
    verificationCode: "123456",
    verificationInfo: { is_user: true, verification_id: "challenge-id" },
  });
});

test("verifies and registers a new user with the China locale", async () => {
  const { calls, client } = mockClient({ isUser: false, token: "verification-token" });
  await completeCloudBasePhoneOtp(client, { ...baseChallenge, isUser: false }, "123456");
  assert.deepEqual(
    calls.map(({ method }) => method),
    ["verify", "signUp"],
  );
  assert.deepEqual(calls[1]?.input, {
    locale: "zh-CN",
    phone_number: "+86 13800138000",
    verification_code: "123456",
    verification_token: "verification-token",
  });
});

test("rejects a non-canonical phone before calling CloudBase", async () => {
  const { calls, client } = mockClient({ isUser: true });
  await assert.rejects(() => requestCloudBasePhoneOtp(client, "+14155550100"));
  assert.deepEqual(calls, []);
});
