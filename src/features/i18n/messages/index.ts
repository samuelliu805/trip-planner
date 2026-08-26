import { authAccountZhCN } from "./auth-account.ts";
import { attachmentsZhCN } from "./attachments.ts";
import { commonZhCN } from "./common.ts";
import { dynamicPlannerZhCN } from "./dynamic-planner.ts";
import { dynamicResearchRoutesZhCN } from "./dynamic-research-routes.ts";
import { dynamicSharingVariantsZhCN } from "./dynamic-sharing-variants.ts";
import { plannerZhCN } from "./planner.ts";
import { researchZhCN } from "./research.ts";
import { runtimeErrorsZhCN } from "./runtime-errors.ts";
import { routesVariantsZhCN } from "./routes-variants.ts";
import { sharingZhCN } from "./sharing.ts";
import { tripsZhCN } from "./trips.ts";
import { validationErrorsZhCN } from "./validation-errors.ts";

export const zhCNMessages: Record<string, string> = {
  ...commonZhCN,
  ...authAccountZhCN,
  ...attachmentsZhCN,
  ...tripsZhCN,
  ...plannerZhCN,
  ...researchZhCN,
  ...sharingZhCN,
  ...routesVariantsZhCN,
  ...dynamicPlannerZhCN,
  ...dynamicResearchRoutesZhCN,
  ...dynamicSharingVariantsZhCN,
  ...validationErrorsZhCN,
  ...runtimeErrorsZhCN,
};
