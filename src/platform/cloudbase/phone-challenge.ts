import "server-only";

import type { CloudBaseCookieStore } from "./session";
import { getCloudBaseAdminConfig } from "./config";
import {
  openPhoneChallenge,
  sealPhoneChallenge,
  type PhoneChallenge,
} from "./phone-challenge-codec";

export const cloudBasePhoneChallengeCookie = "tp-cn-phone-challenge";

function secret() {
  return getCloudBaseAdminConfig().apiKey;
}

export function readCloudBasePhoneChallenge(store: CloudBaseCookieStore, now = Date.now()) {
  return openPhoneChallenge(store.get(cloudBasePhoneChallengeCookie)?.value, secret(), now);
}

export function writeCloudBasePhoneChallenge(
  store: CloudBaseCookieStore,
  challenge: PhoneChallenge,
) {
  store.set?.(cloudBasePhoneChallengeCookie, sealPhoneChallenge(challenge, secret()), {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });
}

export function clearCloudBasePhoneChallenge(store: CloudBaseCookieStore) {
  store.delete?.(cloudBasePhoneChallengeCookie);
}
