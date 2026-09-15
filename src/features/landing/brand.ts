export const tripPlannerBrandName = "There we go";
export const tripPlannerWordmark = "There we go";

export const tripPlannerCnBrandName = "ThereWeGo行至";

export const tripPlannerSiteTitleByRegion = Object.freeze({
  cn: `${tripPlannerCnBrandName} - 协作旅行规划`,
  global: `${tripPlannerBrandName} - Collaborative trip planner`,
});

export function tripPlannerBrandNameForRegion(region: "cn" | "global") {
  return region === "cn" ? tripPlannerCnBrandName : tripPlannerBrandName;
}

export function tripPlannerSiteTitleForRegion(region: "cn" | "global") {
  return tripPlannerSiteTitleByRegion[region];
}
