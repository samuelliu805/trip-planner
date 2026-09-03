import "server-only";

import { cookies } from "next/headers";

import type { PhoneOtpAuthProvider } from "@/platform/contracts/auth";

import { verifyCloudBaseAccessToken } from "./access-token";
import { getCloudBaseConfig } from "./config";
import { normalizeCloudBaseError } from "./errors";
import { writeCloudBaseSession } from "./session";
import { cloudBaseSessionFromVerifiedClaims } from "./session-data";

const legacyChallengeCookie = "tp-cn-phone-challenge";

export class CloudBasePhoneOtpAuthProvider implements PhoneOtpAuthProvider {
  async establishSession(input: Readonly<{ accessToken: string; refreshToken: string }>) {
    const store = await cookies();
    try {
      const claims = await verifyCloudBaseAccessToken(input.accessToken, getCloudBaseConfig().env);
      const session = cloudBaseSessionFromVerifiedClaims(
        { accessToken: input.accessToken, refreshToken: input.refreshToken },
        claims,
      );
      writeCloudBaseSession(store, session);
      store.delete(legacyChallengeCookie);
      return session.user;
    } catch (error) {
      throw normalizeCloudBaseError(error, "Phone sign-in failed. Please try again.");
    }
  }
}
