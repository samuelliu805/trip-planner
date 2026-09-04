"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

const historyStateKey = "__tripPlannerMapSheet";

function objectHistoryState() {
  return history.state && typeof history.state === "object" ? history.state : {};
}

/** Lets mobile Back close the map sheet instead of leaving the active Plan route. */
export function usePlannerMapSheetHistory(setMapExpanded: Dispatch<SetStateAction<boolean>>) {
  const entryActive = useRef(false);
  const [marker] = useState(() => crypto.randomUUID());

  useEffect(() => {
    function handlePopState(event: PopStateEvent) {
      const mapEntry = event.state?.[historyStateKey] === marker;
      entryActive.current = mapEntry;
      setMapExpanded(mapEntry);
    }

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (history.state?.[historyStateKey] !== marker) return;
      const nextState = { ...objectHistoryState() };
      delete nextState[historyStateKey];
      history.replaceState(nextState, "", location.href);
    };
  }, [marker, setMapExpanded]);

  const open = useCallback(() => {
    if (window.matchMedia("(max-width: 899px)").matches && !entryActive.current) {
      history.pushState({ ...objectHistoryState(), [historyStateKey]: marker }, "", location.href);
      entryActive.current = true;
    }
    setMapExpanded(true);
  }, [marker, setMapExpanded]);

  const onOpenChange = useCallback(
    (openState: boolean) => {
      if (openState) {
        open();
        return;
      }
      setMapExpanded(false);
      if (!entryActive.current) return;
      entryActive.current = false;
      history.back();
    },
    [open, setMapExpanded],
  );

  return { onOpenChange, open };
}
