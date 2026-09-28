"use client";

import { useEffect, useRef, useState, type SetStateAction } from "react";

import type { PlannerClipboard } from "../grid-interactions";
import {
  readStoredPlannerClipboard,
  writeStoredPlannerClipboard,
} from "../planner-clipboard-storage";

export function usePlannerClipboardStorage(tripId: string) {
  const [internalClipboard, commitClipboard] = useState<PlannerClipboard | null>(null);
  const clipboardRef = useRef<PlannerClipboard | null>(null);

  useEffect(() => {
    try {
      clipboardRef.current = readStoredPlannerClipboard(window.sessionStorage, tripId);
    } catch {
      clipboardRef.current = null;
    }
    commitClipboard(clipboardRef.current);
  }, [tripId]);

  function setInternalClipboard(value: SetStateAction<PlannerClipboard | null>) {
    const payload = typeof value === "function" ? value(clipboardRef.current) : value;
    clipboardRef.current = payload;
    commitClipboard(payload);
    try {
      writeStoredPlannerClipboard(window.sessionStorage, tripId, payload);
    } catch {
      // System clipboard access and the current workspace's memory remain available.
    }
  }

  return { internalClipboard, setInternalClipboard };
}
