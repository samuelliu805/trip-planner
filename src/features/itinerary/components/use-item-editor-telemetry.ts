"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createItemEditorTelemetrySession } from "@/features/itinerary/item-editor-telemetry";
import type { ItineraryItem, ItineraryItemType } from "@/features/itinerary/types";
import type { ItemEditorCloseReason } from "@/lib/telemetry/events";
import { itemKindForTelemetry } from "@/lib/telemetry/product";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";

export function useItemEditorTelemetry({
  dirty,
  item,
  onCancel,
  onCreateAnother,
  onSaved,
  type,
}: {
  dirty: boolean;
  item?: ItineraryItem;
  onCancel: () => void;
  onCreateAnother?: (item: ItineraryItem) => void;
  onSaved: (item: ItineraryItem) => void;
  type: ItineraryItemType;
}) {
  const [session] = useState(() => {
    const itemKind = itemKindForTelemetry(type);
    return itemKind
      ? createItemEditorTelemetrySession({
          capture: (eventName, properties) =>
            captureBrowserProductEvent(eventName, properties, { actorType: "authenticated" }),
          editorMode: item ? "edit" : "create",
          itemKind,
        })
      : null;
  });
  const dirtyRef = useRef(dirty);
  const closeReasonRef = useRef<ItemEditorCloseReason>("navigation");

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const closeEditor = useCallback(() => {
    session?.close(closeReasonRef.current, dirtyRef.current);
    onCancel();
  }, [onCancel, session]);
  const onCreatedAnother = useCallback(
    (savedItem: ItineraryItem) => {
      session?.close("saved", dirtyRef.current);
      onCreateAnother?.(savedItem);
    },
    [onCreateAnother, session],
  );
  const onItemSaved = useCallback(
    (savedItem: ItineraryItem) => {
      session?.close("saved", dirtyRef.current);
      onSaved(savedItem);
    },
    [onSaved, session],
  );
  const setCloseReason = useCallback((reason: ItemEditorCloseReason) => {
    closeReasonRef.current = reason;
  }, []);

  useEffect(() => {
    session?.open();
    const reportPageHidden = () => session?.close("page_hidden", dirtyRef.current);
    const reportBrowserBack = () => {
      closeReasonRef.current = "browser_back";
      session?.close("browser_back", dirtyRef.current);
    };
    window.addEventListener("pagehide", reportPageHidden);
    window.addEventListener("popstate", reportBrowserBack);
    return () => {
      window.removeEventListener("pagehide", reportPageHidden);
      window.removeEventListener("popstate", reportBrowserBack);
      session?.close("navigation", dirtyRef.current);
    };
  }, [session]);

  return {
    closeEditor,
    onCreatedAnother,
    onItemSaved,
    setCloseReason,
  };
}
