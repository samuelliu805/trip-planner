import type { ItineraryItem, ItineraryItemType, TransportMode } from "../types";

export type PlannerItemFormProps = {
  dayId: string;
  item?: ItineraryItem;
  onCancel: () => void;
  onDraftChange?: (item: ItineraryItem | null) => void;
  onError: (message: string) => void;
  onSaved: (item: ItineraryItem) => void;
  tripId: string;
  type: ItineraryItemType;
  unavailableTransportModes?: TransportMode[];
  variantId: string;
};
