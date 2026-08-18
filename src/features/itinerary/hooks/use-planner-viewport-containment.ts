"use client";

import { useEffect } from "react";

const EDITABLE_SELECTOR = "input, textarea, select, [contenteditable='true']";

function isEditing() {
  return document.activeElement?.matches(EDITABLE_SELECTOR) ?? false;
}

export function usePlannerViewportContainment() {
  useEffect(() => {
    const root = document.documentElement;
    const visualViewport = window.visualViewport;
    const timers = new Set<number>();
    let frame = 0;

    function keyboardIsClosed() {
      if (!visualViewport) return !isEditing();
      return !isEditing() && window.innerHeight - visualViewport.height < 80;
    }

    function resetDocumentScroll() {
      if (!keyboardIsClosed()) return;
      window.scrollTo({ left: 0, top: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }

    function measure() {
      const height = visualViewport?.height ?? window.innerHeight;
      const top = visualViewport?.offsetTop ?? 0;
      root.style.setProperty("--planner-visual-viewport-height", `${Math.round(height)}px`);
      root.style.setProperty("--planner-visual-viewport-top", `${Math.round(top)}px`);
      resetDocumentScroll();
    }

    function scheduleMeasure() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    }

    function settleAfterKeyboard() {
      [0, 80, 240, 500].forEach((delay) => {
        const timer = window.setTimeout(() => {
          timers.delete(timer);
          scheduleMeasure();
        }, delay);
        timers.add(timer);
      });
    }

    measure();
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("orientationchange", settleAfterKeyboard);
    window.addEventListener("scroll", resetDocumentScroll, { passive: true });
    document.addEventListener("focusout", settleAfterKeyboard, true);
    visualViewport?.addEventListener("resize", scheduleMeasure);
    visualViewport?.addEventListener("scroll", scheduleMeasure);

    return () => {
      cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("orientationchange", settleAfterKeyboard);
      window.removeEventListener("scroll", resetDocumentScroll);
      document.removeEventListener("focusout", settleAfterKeyboard, true);
      visualViewport?.removeEventListener("resize", scheduleMeasure);
      visualViewport?.removeEventListener("scroll", scheduleMeasure);
      root.style.removeProperty("--planner-visual-viewport-height");
      root.style.removeProperty("--planner-visual-viewport-top");
    };
  }, []);
}
