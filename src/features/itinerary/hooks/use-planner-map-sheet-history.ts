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
  const closing = useRef(false);
  const returnUrl = useRef<string | undefined>(undefined);
  const [marker] = useState(() => crypto.randomUUID());

  useEffect(() => {
    function handlePopState(event: PopStateEvent) {
      const mapEntry = event.state?.[historyStateKey] === marker;
      entryActive.current = mapEntry;
      closing.current = false;
      setMapExpanded(mapEntry);
    }

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (history.state?.[historyStateKey] !== marker) return;
      const nextState = { ...objectHistoryState() };
      delete nextState[historyStateKey];
      history.replaceState(
        nextState,
        "",
        returnUrl.current ?? `${location.pathname}${location.search}`,
      );
    };
  }, [marker, setMapExpanded]);

  const open = useCallback(() => {
    if (window.matchMedia("(max-width: 899px)").matches && !entryActive.current) {
      returnUrl.current = location.href;
      history.pushState(
        { ...objectHistoryState(), [historyStateKey]: marker },
        "",
        `${location.pathname}${location.search}#trip-planner-map-${marker}`,
      );
      entryActive.current = true;
    }
    closing.current = false;
    setMapExpanded(true);
  }, [marker, setMapExpanded]);

  const onOpenChange = useCallback(
    (openState: boolean) => {
      if (openState) {
        open();
        return;
      }
      const ownsCurrentEntry = history.state?.[historyStateKey] === marker;
      if (entryActive.current && ownsCurrentEntry) {
        if (!closing.current) {
          closing.current = true;
          history.back();
        }
        return;
      }
      entryActive.current = false;
      closing.current = false;
      setMapExpanded(false);
    },
    [marker, open, setMapExpanded],
  );

  return { onOpenChange, open };
}
