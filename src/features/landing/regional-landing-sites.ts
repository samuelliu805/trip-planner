import type { AppRegion } from "@/platform/config/provider-matrix";

export const regionalLandingSites = Object.freeze({
  cn: "https://trip-planner-cn-306129-11-1253819205.sh.run.tcloudbase.com/",
  global: "https://trip-planner-ivory-one.vercel.app/",
}) satisfies Readonly<Record<AppRegion, string>>;

export function alternateLandingSite(region: AppRegion) {
  const alternateRegion = region === "global" ? "cn" : "global";
  return {
    href: regionalLandingSites[alternateRegion],
    message: region === "global" ? "Go to China site" : "Go to Global site",
  } as const;
}
