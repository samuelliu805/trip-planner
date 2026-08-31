import type { AppRegion } from "../config/provider-matrix";

export type BackendCapabilities = Readonly<{
  googleOAuth: boolean;
  realtime: boolean;
  selfRegistration: boolean;
  signedUrls: boolean;
  wechatAuth: boolean;
}>;

export const backendCapabilitiesByRegion = Object.freeze({
  global: Object.freeze({
    googleOAuth: true,
    realtime: true,
    selfRegistration: true,
    signedUrls: true,
    wechatAuth: false,
  }),
  cn: Object.freeze({
    googleOAuth: false,
    realtime: false,
    selfRegistration: false,
    signedUrls: true,
    wechatAuth: false,
  }),
}) satisfies Readonly<Record<AppRegion, BackendCapabilities>>;

export function capabilitiesForRegion(region: AppRegion): BackendCapabilities {
  return backendCapabilitiesByRegion[region];
}
