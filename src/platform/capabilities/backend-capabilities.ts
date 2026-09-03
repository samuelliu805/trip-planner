import type { AppRegion } from "../config/provider-matrix";

export type PublicAuthMethod = "email_password" | "google_oauth" | "phone_otp";
export type ProtectedAuthMethod = "username_password";

export type BackendCapabilities = Readonly<{
  itineraryItemLinks: boolean;
  protectedAuthMethods: readonly ProtectedAuthMethod[];
  publicAuthMethods: readonly PublicAuthMethod[];
  realtime: boolean;
  signedUrls: boolean;
  wechatAuth: boolean;
}>;

export const backendCapabilitiesByRegion = Object.freeze({
  global: Object.freeze({
    itineraryItemLinks: true,
    protectedAuthMethods: Object.freeze([] as const),
    publicAuthMethods: Object.freeze(["email_password", "google_oauth"] as const),
    realtime: true,
    signedUrls: true,
    wechatAuth: false,
  }),
  cn: Object.freeze({
    itineraryItemLinks: false,
    protectedAuthMethods: Object.freeze(["username_password"] as const),
    publicAuthMethods: Object.freeze(["phone_otp"] as const),
    realtime: false,
    signedUrls: true,
    wechatAuth: false,
  }),
}) satisfies Readonly<Record<AppRegion, BackendCapabilities>>;

export function capabilitiesForRegion(region: AppRegion): BackendCapabilities {
  return backendCapabilitiesByRegion[region];
}

type PublicAuthEnvironment = Readonly<{
  CLOUDBASE_CI_PASSWORD_AUTH_ENABLED?: string;
  CN_PUBLIC_PHONE_AUTH_ENABLED?: string;
}>;

export function capabilitiesForEnvironment(
  region: AppRegion,
  env: PublicAuthEnvironment,
): BackendCapabilities {
  const base = capabilitiesForRegion(region);
  if (region === "global") return base;
  return Object.freeze({
    ...base,
    protectedAuthMethods:
      env.CLOUDBASE_CI_PASSWORD_AUTH_ENABLED === "true"
        ? base.protectedAuthMethods
        : Object.freeze([]),
    publicAuthMethods:
      env.CN_PUBLIC_PHONE_AUTH_ENABLED === "true" ? base.publicAuthMethods : Object.freeze([]),
  });
}
