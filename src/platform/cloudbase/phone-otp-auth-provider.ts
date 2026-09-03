import "server-only";

import { cookies } from "next/headers";

import type { PhoneOtpAuthProvider } from "@/platform/contracts/auth";
import { PlatformOperationError } from "@/platform/contracts/errors";

import { createCloudBaseClients } from "./client";
import { cloudBaseData, normalizeCloudBaseError } from "./errors";
import {
  clearCloudBasePhoneChallenge,
  readCloudBasePhoneChallenge,
  writeCloudBasePhoneChallenge,
} from "./phone-challenge";
import { completeCloudBasePhoneOtp, requestCloudBasePhoneOtp } from "./phone-otp-runtime";
import { sessionFromData, withCloudBaseAuthLock, writeCloudBaseSession } from "./session";

const challengeLifetimeMs = 10 * 60_000;
const resendDelayMs = 60_000;

export class CloudBasePhoneOtpAuthProvider implements PhoneOtpAuthProvider {
  async clearChallenge() {
    clearCloudBasePhoneChallenge(await cookies());
  }

  async requestOtp(input: Readonly<{ phone: string }>) {
    const store = await cookies();
    const now = Date.now();
    const existing = readCloudBasePhoneChallenge(store, now);
    if (existing && existing.issuedAt + resendDelayMs > now) {
      throw new PlatformOperationError(
        "rate_limited",
        "Wait for the countdown before requesting another code.",
      );
    }
    try {
      const result = await requestCloudBasePhoneOtp(createCloudBaseClients().auth, input.phone);
      const issuedAt = Date.now();
      writeCloudBasePhoneChallenge(store, {
        expiresAt: issuedAt + challengeLifetimeMs,
        isUser: result.isUser,
        issuedAt,
        phone: input.phone,
        verificationId: result.verificationId,
      });
      return Object.freeze({ resendAt: issuedAt + resendDelayMs });
    } catch (error) {
      throw normalizeCloudBaseError(error, "A verification code could not be requested.");
    }
  }

  async verifyOtp(input: Readonly<{ code: string }>) {
    const store = await cookies();
    const challenge = readCloudBasePhoneChallenge(store);
    if (!challenge) {
      clearCloudBasePhoneChallenge(store);
      throw new PlatformOperationError(
        "otp_expired",
        "Your verification request has expired. Request a new code.",
      );
    }
    try {
      const user = await withCloudBaseAuthLock(async () => {
        const { auth } = createCloudBaseClients();
        await completeCloudBasePhoneOtp(auth, challenge, input.code);
        const result = await auth.getSession();
        const session = sessionFromData(cloudBaseData(result, "Phone sign-in failed."));
        writeCloudBaseSession(store, session);
        return session.user;
      });
      clearCloudBasePhoneChallenge(store);
      return user;
    } catch (error) {
      throw normalizeCloudBaseError(error, "Phone sign-in failed. Please try again.");
    }
  }
}
