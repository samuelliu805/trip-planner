import type { Dispatch, ReactNode, SetStateAction } from "react";

import type { EditorState, PlannerCategory } from "./planner-config";
import type { ItineraryItem, PlannerDay } from "../types";
import type {
  ConvertedPlanCostLine,
  PlanCostSummary,
  PlanResearchItem,
  VariantResearchSelection,
} from "../../research/types";
import type { PlanResearchContext } from "../../research/urls";
import type { Trip } from "@/platform/contracts/trips";

export type PlannerToolbarProps = {
  activeCategory?: PlannerCategory;
  activeCellAtCapacity: boolean;
  activeDay?: PlannerDay;
  clearItemCount: number;
  clearPending: boolean;
  copyPreviousDay: () => Promise<void>;
  copySelectionToClipboard: () => Promise<void>;
  dayMutationPending: boolean;
  deleteError: boolean;
  fillLabel: string;
  fillThroughDay?: number;
  insertDay: (position: number) => Promise<void>;
  interactionError?: string;
  isFillDragging: boolean;
  mutating: boolean;
  planCostLines: ConvertedPlanCostLine[];
  planCostSummary: PlanCostSummary;
  planDays: PlannerDay[];
  onArrangeActivities: (day: PlannerDay) => void;
  pasteAvailableClipboard: () => Promise<void>;
  removeDay: (dayId: string) => Promise<void>;
  requestClearSelection: () => void;
  requestPending: boolean;
  researchContext?: PlanResearchContext & { label: string };
  researchItems: PlanResearchItem[];
  researchSelections: VariantResearchSelection[];
  selectedCount: number;
  selectedItem?: ItineraryItem;
  setCopyDaysOpen: Dispatch<SetStateAction<boolean>>;
  setEditor: Dispatch<SetStateAction<EditorState | null>>;
  setInteractionError: Dispatch<SetStateAction<string | undefined>>;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  shareControls?: ReactNode;
  accountEmail: string;
  trip: Trip;
  variantControls: ReactNode;
  variantId: string;
  workspaceDayCount: number;
  workspaceError: boolean;
};
