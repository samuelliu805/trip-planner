"use client";

import { useEffect } from "react";

import { tripRouteRecoveryStorageKey } from "../route-recovery.ts";

const EDITABLE_SELECTOR = "input, textarea, select, [contenteditable='true']";

type ActiveElementMatch = {
  matches(selectors: string): boolean;
};

export function shouldRestorePlannerDocumentScroll(activeElement: ActiveElementMatch | null) {
  return !(activeElement?.matches(EDITABLE_SELECTOR) ?? false);
}

function isEditing() {
  return !shouldRestorePlannerDocumentScroll(document.activeElement);
}

export function usePlannerViewportContainment() {
  useEffect(() => {
    sessionStorage.removeItem(tripRouteRecoveryStorageKey);
    const visualViewport = window.visualViewport;
    const timers = new Set<number>();

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") settleAfterKeyboard();
    }

    function resetDocumentScroll() {
      if (isEditing()) return;
      window.scrollTo({ left: 0, top: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }

    function settleAfterKeyboard() {
      [0, 80, 240, 500].forEach((delay) => {
        const timer = window.setTimeout(() => {
          timers.delete(timer);
          resetDocumentScroll();
        }, delay);
        timers.add(timer);
      });
    }

    resetDocumentScroll();
    window.addEventListener("resize", settleAfterKeyboard);
    window.addEventListener("orientationchange", settleAfterKeyboard);
    window.addEventListener("scroll", resetDocumentScroll, { passive: true });
    window.addEventListener("pageshow", settleAfterKeyboard);
    window.addEventListener("focus", settleAfterKeyboard);
    document.addEventListener("focusout", settleAfterKeyboard, true);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    visualViewport?.addEventListener("resize", settleAfterKeyboard);
    visualViewport?.addEventListener("scroll", resetDocumentScroll);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("resize", settleAfterKeyboard);
      window.removeEventListener("orientationchange", settleAfterKeyboard);
      window.removeEventListener("scroll", resetDocumentScroll);
      window.removeEventListener("pageshow", settleAfterKeyboard);
      window.removeEventListener("focus", settleAfterKeyboard);
      document.removeEventListener("focusout", settleAfterKeyboard, true);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      visualViewport?.removeEventListener("resize", settleAfterKeyboard);
      visualViewport?.removeEventListener("scroll", resetDocumentScroll);
    };
  }, []);
}
