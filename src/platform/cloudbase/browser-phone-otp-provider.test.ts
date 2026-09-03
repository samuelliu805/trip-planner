import assert from "node:assert/strict";
import test from "node:test";

import { PlatformOperationError } from "../contracts/errors.ts";
import { CloudBaseBrowserPhoneOtpProvider } from "./browser-phone-otp-provider.ts";

test("keeps the official CloudBase OTP verifier bound to the send request", async () => {
  const calls: Array<{ input: unknown; method: string }> = [];
  const provider = new CloudBaseBrowserPhoneOtpProvider({
    async signInWithOtp(input) {
      calls.push({ input, method: "signInWithOtp" });
      return {
        data: {
          async verifyOtp(verification) {
            calls.push({ input: verification, method: "verifyOtp" });
            return {
              data: {
                session: {
                  access_token: "signed-access-token",
                  refresh_token: "refresh-token",
                },
              },
              error: null,
            };
          },
        },
        error: null,
      };
    },
  });

  await provider.requestOtp("+8613800138000");
  assert.deepEqual(await provider.verifyOtp("123456"), {
    accessToken: "signed-access-token",
    refreshToken: "refresh-token",
  });
  assert.deepEqual(await provider.verifyOtp("123456"), {
    accessToken: "signed-access-token",
    refreshToken: "refresh-token",
  });
  assert.deepEqual(calls, [
    {
      input: { options: { shouldCreateUser: true }, phone: "13800138000" },
      method: "signInWithOtp",
    },
    { input: { token: "123456" }, method: "verifyOtp" },
  ]);
});

test("replaces the verifier when a code is resent", async () => {
  let request = 0;
  const provider = new CloudBaseBrowserPhoneOtpProvider({
    async signInWithOtp() {
      request += 1;
      const current = request;
      return {
        data: {
          async verifyOtp() {
            return {
              data: {
                session: {
                  access_token: `access-${current}`,
                  refresh_token: `refresh-${current}`,
                },
              },
              error: null,
            };
          },
        },
        error: null,
      };
    },
  });

  await provider.requestOtp("+8613800138000");
  await provider.requestOtp("+8613800138000");
  assert.deepEqual(await provider.verifyOtp("123456"), {
    accessToken: "access-2",
    refreshToken: "refresh-2",
  });
});

test("fails closed when verification is attempted without the bound callback", async () => {
  const provider = new CloudBaseBrowserPhoneOtpProvider({
    async signInWithOtp() {
      return { data: {}, error: null };
    },
  });

  await assert.rejects(
    () => provider.verifyOtp("123456"),
    (error) => error instanceof PlatformOperationError && error.code === "otp_expired",
  );
});
