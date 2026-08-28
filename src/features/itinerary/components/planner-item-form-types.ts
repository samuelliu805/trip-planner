import type { ItineraryItem, ItineraryItemType, TransportMode } from "../types";
import type { PlannerItemSaveFeedback } from "./planner-item-save-feedback";
import type { ItemEditorCloseReason } from "../../../lib/telemetry/events";

export type PlannerItemFormProps = {
  dayDate: string;
  dayId: string;
  dayItems: ItineraryItem[];
  defaultCurrency: string;
  item?: ItineraryItem;
  onCancel: () => void;
  onCloseRequestRegistration?: (handler: ((reason?: ItemEditorCloseReason) => void) | null) => void;
  onDraftChange?: (item: ItineraryItem | null) => void;
  onError: (message: string) => void;
  onCreateAnother?: (item: ItineraryItem) => void;
  onSaveFeedback: (feedback?: PlannerItemSaveFeedback) => void;
  onSaved: (item: ItineraryItem) => void;
  shareAttachmentsEnabled: boolean;
  tripId: string;
  type: ItineraryItemType;
  unavailableTransportModes?: TransportMode[];
  variantId: string;
};
