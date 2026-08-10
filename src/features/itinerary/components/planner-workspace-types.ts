import type { ReactNode } from "react";

import type { PlannerVariant, PlannerWorkspace } from "../types";
import type { PlanResearchItem } from "../../research/types";
import type { Tables } from "../../../types/database";

export type PlannerWorkspaceProps = {
  deleteError: boolean;
  initialResearchItems: PlanResearchItem[];
  initialVariants: PlannerVariant[];
  initialWorkspace: PlannerWorkspace;
  settings: ReactNode;
  shareControls?: ReactNode;
  trip: Tables<"trips">;
};
