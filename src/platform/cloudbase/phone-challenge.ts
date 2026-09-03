import "server-only";

import type { CloudBaseCookieStore } from "./session";
import { getCloudBaseAdminConfig } from "./config";
import {
  openFirstPhoneChallenge,
  sealPhoneChallenge,
  type PhoneChallenge,
} from "./phone-challenge-codec";

export const cloudBasePhoneChallengeCookie = "tp-cn-phone-challenge";

function secret() {
  return getCloudBaseAdminConfig().apiKey;
}

export function readCloudBasePhoneChallenge(
  store: CloudBaseCookieStore,
  challengeToken?: string,
  now = Date.now(),
) {
  return openFirstPhoneChallenge(
    [challengeToken, store.get(cloudBasePhoneChallengeCookie)?.value],
    secret(),
    now,
  );
}

export function writeCloudBasePhoneChallenge(
  store: CloudBaseCookieStore,
  challenge: PhoneChallenge,
) {
  const challengeToken = sealPhoneChallenge(challenge, secret());
  store.set?.(cloudBasePhoneChallengeCookie, challengeToken, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return challengeToken;
}

export function clearCloudBasePhoneChallenge(store: CloudBaseCookieStore) {
  store.delete?.(cloudBasePhoneChallengeCookie);
}
