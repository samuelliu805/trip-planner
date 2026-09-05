"use client";

import { useEffect } from "react";

export function plannerEditorViewportBox({
  innerHeight,
  visualViewportHeight,
  visualViewportOffsetTop,
}: {
  innerHeight: number;
  visualViewportHeight?: number;
  visualViewportOffsetTop?: number;
}) {
  return {
    height: Math.max(1, visualViewportHeight ?? innerHeight),
    top: Math.max(0, visualViewportOffsetTop ?? 0),
  };
}

/** Keep browser chrome and the software keyboard from shifting a full-screen editor. */
export function usePlannerEditorViewportLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    const body = document.body;
    let frame = 0;
    const syncViewport = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const viewport = window.visualViewport;
        const box = plannerEditorViewportBox({
          innerHeight: window.innerHeight,
          visualViewportHeight: viewport?.height,
          visualViewportOffsetTop: viewport?.offsetTop,
        });
        root.style.setProperty("--planner-editor-viewport-height", `${box.height}px`);
        root.style.setProperty("--planner-editor-viewport-top", `${box.top}px`);
        if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
        document.scrollingElement?.scrollTo(0, 0);
      });
    };

    root.classList.add("planner-editor-viewport-locked");
    body.classList.add("planner-editor-viewport-locked");
    syncViewport();
    window.addEventListener("resize", syncViewport);
    window.addEventListener("scroll", syncViewport, { passive: true });
    window.visualViewport?.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("scroll", syncViewport);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", syncViewport);
      window.removeEventListener("scroll", syncViewport);
      window.visualViewport?.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("scroll", syncViewport);
      root.classList.remove("planner-editor-viewport-locked");
      body.classList.remove("planner-editor-viewport-locked");
      root.style.removeProperty("--planner-editor-viewport-height");
      root.style.removeProperty("--planner-editor-viewport-top");
      window.scrollTo(0, 0);
    };
  }, [active]);
}
