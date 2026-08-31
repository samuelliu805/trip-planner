"use client";

import { useEffect } from "react";

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
    const visualViewport = window.visualViewport;
    const timers = new Set<number>();

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
    document.addEventListener("focusout", settleAfterKeyboard, true);
    visualViewport?.addEventListener("resize", settleAfterKeyboard);
    visualViewport?.addEventListener("scroll", resetDocumentScroll);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("resize", settleAfterKeyboard);
      window.removeEventListener("orientationchange", settleAfterKeyboard);
      window.removeEventListener("scroll", resetDocumentScroll);
      document.removeEventListener("focusout", settleAfterKeyboard, true);
      visualViewport?.removeEventListener("resize", settleAfterKeyboard);
      visualViewport?.removeEventListener("scroll", resetDocumentScroll);
    };
  }, []);
}
