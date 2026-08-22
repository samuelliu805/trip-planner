"use client";

import { useEffect } from "react";

/** Keeps iPadOS browser chrome and the software keyboard from shifting a full-screen editor. */
export function usePlannerEditorViewportLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    const body = document.body;
    let frame = 0;
    const resetLayoutScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
        document.scrollingElement?.scrollTo(0, 0);
      });
    };

    root.classList.add("planner-editor-viewport-locked");
    body.classList.add("planner-editor-viewport-locked");
    resetLayoutScroll();
    window.addEventListener("scroll", resetLayoutScroll, { passive: true });
    window.visualViewport?.addEventListener("resize", resetLayoutScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", resetLayoutScroll);
      window.visualViewport?.removeEventListener("resize", resetLayoutScroll);
      root.classList.remove("planner-editor-viewport-locked");
      body.classList.remove("planner-editor-viewport-locked");
      window.scrollTo(0, 0);
    };
  }, [active]);
}
