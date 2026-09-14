export const tripPlannerBrandName = "There we go";
export const tripPlannerWordmark = "There we go";

export const tripPlannerCnBrandName = "ThereWeGo行止";

export function tripPlannerBrandNameForRegion(region: "cn" | "global") {
  return region === "cn" ? tripPlannerCnBrandName : tripPlannerBrandName;
}
