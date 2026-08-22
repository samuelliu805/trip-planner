import type { ItineraryItem, ItineraryItemType, TransportMode } from "../types";

export type PlannerItemFormProps = {
  dayDate: string;
  dayId: string;
  dayItems: ItineraryItem[];
  defaultCurrency: string;
  item?: ItineraryItem;
  onCancel: () => void;
  onCloseRequestRegistration?: (handler: (() => void) | null) => void;
  onDraftChange?: (item: ItineraryItem | null) => void;
  onError: (message: string) => void;
  onCreateAnother?: (item: ItineraryItem) => void;
  onSaved: (item: ItineraryItem) => void;
  shareAttachmentsEnabled: boolean;
  tripId: string;
  type: ItineraryItemType;
  unavailableTransportModes?: TransportMode[];
  variantId: string;
};
