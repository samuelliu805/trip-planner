import type { ReactNode } from "react";

import type { PlannerVariant, PlannerWorkspace } from "../types";
import type {
  ExchangeRateTable,
  PlanResearchItem,
  VariantResearchSelection,
} from "../../research/types";
import type { Tables } from "../../../types/database";

export type PlannerWorkspaceProps = {
  accountEmail: string;
  deleteError: boolean;
  exchangeRates: ExchangeRateTable | null;
  initialResearchItems: PlanResearchItem[];
  initialResearchSelections: VariantResearchSelection[];
  initialSettingsOpen?: boolean;
  initialVariants: PlannerVariant[];
  initialWorkspace: PlannerWorkspace;
  settings: ReactNode;
  shareAttachmentsEnabled: boolean;
  shareControls?: ReactNode;
  trip: Tables<"trips">;
};
