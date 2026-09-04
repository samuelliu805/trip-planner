import assert from "node:assert/strict";
import test from "node:test";

import { PlatformOperationError } from "../contracts/errors.ts";
import { CloudBaseBrowserPhoneOtpProvider } from "./browser-phone-otp-provider.ts";

test("keeps the official CloudBase OTP verifier bound to the send request", async () => {
  const calls: Array<{ input: unknown; method: string }> = [];
  const provider = new CloudBaseBrowserPhoneOtpProvider({
    async signInWithOtp(input: unknown) {
      calls.push({ input, method: "signInWithOtp" });
      return {
        data: {
          async verifyOtp(verification: unknown) {
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
  } as never);

  await provider.requestOtp({ intent: "sign_in", phone: "+8613800138000" });
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
      input: { options: { shouldCreateUser: false }, phone: "13800138000" },
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
  } as never);

  await provider.requestOtp({ intent: "sign_in", phone: "+8613800138000" });
  await provider.requestOtp({ intent: "sign_in", phone: "+8613800138000" });
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
  } as never);

  await assert.rejects(
    () => provider.verifyOtp("123456"),
    (error) => error instanceof PlatformOperationError && error.code === "otp_expired",
  );
});

test("uses CloudBase phone sign-up with a password before verifying the OTP", async () => {
  const calls: unknown[] = [];
  const provider = new CloudBaseBrowserPhoneOtpProvider({
    async signUp(input: unknown) {
      calls.push(input);
      return {
        data: {
          async verifyOtp() {
            return {
              data: { session: { access_token: "access", refresh_token: "refresh" } },
              error: null,
            };
          },
        },
        error: null,
      };
    },
  } as never);
  await provider.requestOtp({
    intent: "sign_up",
    password: "secure123",
    phone: "+8613800138000",
  });
  assert.deepEqual(calls, [{ password: "secure123", phone: "13800138000" }]);
});

test("keeps the E.164 phone bound to the official password-reset callback", async () => {
  const calls: unknown[] = [];
  const provider = new CloudBaseBrowserPhoneOtpProvider({
    async resetPasswordForEmail(phone: string) {
      calls.push(phone);
      return {
        data: {
          async updateUser(input: unknown) {
            calls.push(input);
            return { data: {}, error: null };
          },
        },
        error: null,
      };
    },
  } as never);
  await provider.requestPasswordResetOtp("+8613800138000");
  await provider.resetPassword("123456", "newpass123");
  assert.deepEqual(calls, ["+8613800138000", { nonce: "123456", password: "newpass123" }]);
});
