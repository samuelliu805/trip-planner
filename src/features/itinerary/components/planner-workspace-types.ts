import type { ReactNode } from "react";

import type { PlannerVariant, PlannerWorkspace } from "../types";
import type {
  ExchangeRateTable,
  PlanResearchItem,
  VariantResearchSelection,
} from "../../research/types";
import type { Trip } from "@/platform/contracts/trips";

export type PlannerWorkspaceProps = {
  accountEmail: string;
  deleteError: boolean;
  exchangeRates: ExchangeRateTable | null;
  guestExperience?: {
    onSaveToAccount: () => void;
    onShare: () => void;
    saveStatus: ReactNode;
  };
  initialResearchItems: PlanResearchItem[];
  initialResearchSelections: VariantResearchSelection[];
  initialEditorItemId?: string;
  initialSettingsOpen?: boolean;
  initialVariants: PlannerVariant[];
  initialWorkspace: PlannerWorkspace;
  settings: ReactNode;
  shareAttachmentsEnabled: boolean;
  shareControls?: ReactNode;
  trip: Trip;
};
