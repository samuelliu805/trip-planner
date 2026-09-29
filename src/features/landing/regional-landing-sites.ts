import type { AppRegion } from "@/platform/config/provider-matrix";

export const regionalLandingSites = Object.freeze({
  cn: "https://trip-planner-cn-306129-11-1253819205.sh.run.tcloudbase.com/",
  global: "https://trip-planner-ivory-one.vercel.app/",
}) satisfies Readonly<Record<AppRegion, string>>;

type RegionalLandingEnvironment = Readonly<{
  CN_SITE_URL?: string;
  GLOBAL_SITE_URL?: string;
}>;

function regionalLandingUrl(region: AppRegion, env: RegionalLandingEnvironment) {
  const name = region === "cn" ? "CN_SITE_URL" : "GLOBAL_SITE_URL";
  const configured = env[name]?.trim();
  if (!configured) return regionalLandingSites[region];
  const url = new URL(configured);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${name} must be an HTTPS site origin.`);
  }
  return `${url.origin}/`;
}

export function alternateLandingSite(
  region: AppRegion,
  env: RegionalLandingEnvironment = {
    CN_SITE_URL: process.env.CN_SITE_URL,
    GLOBAL_SITE_URL: process.env.GLOBAL_SITE_URL,
  },
) {
  const alternateRegion = region === "global" ? "cn" : "global";
  return {
    href: regionalLandingUrl(alternateRegion, env),
    message: region === "global" ? "Go to China site" : "Go to Global site",
  } as const;
}
