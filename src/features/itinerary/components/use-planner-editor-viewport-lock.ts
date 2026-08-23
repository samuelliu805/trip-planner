"use client";

import { useEffect } from "react";

const viewportSettleDelays = [0, 80, 240, 500];
const zoomTolerance = 1.01;

/** Keep browser chrome and the software keyboard from shifting a full-screen editor. */
export function usePlannerEditorViewportLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    const body = document.body;
    const visualViewport = window.visualViewport;
    const previousViewportTop = root.style.getPropertyValue("--planner-editor-viewport-top");
    const previousViewportTopPriority = root.style.getPropertyPriority(
      "--planner-editor-viewport-top",
    );
    let frame = 0;
    const settleTimers = new Set<number>();

    const forceLayoutOrigin = () => {
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
      document.scrollingElement?.scrollTo(0, 0);
      root.scrollTop = 0;
      body.scrollTop = 0;
    };

    const publishViewportTop = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const viewportIsUsable =
          visualViewport && visualViewport.height > 0 && visualViewport.scale <= zoomTolerance;
        const offsetTop = viewportIsUsable ? Math.max(0, visualViewport.offsetTop) : 0;
        root.style.setProperty("--planner-editor-viewport-top", `${Math.round(offsetTop)}px`);
        forceLayoutOrigin();
      });
    };

    const settleViewport = () => {
      viewportSettleDelays.forEach((delay) => {
        const timer = window.setTimeout(() => {
          settleTimers.delete(timer);
          publishViewportTop();
        }, delay);
        settleTimers.add(timer);
      });
    };

    root.classList.add("planner-editor-viewport-locked");
    body.classList.add("planner-editor-viewport-locked");
    publishViewportTop();
    window.addEventListener("scroll", publishViewportTop, { passive: true });
    window.addEventListener("resize", publishViewportTop);
    window.addEventListener("orientationchange", settleViewport);
    document.addEventListener("focusout", settleViewport, true);
    visualViewport?.addEventListener("resize", publishViewportTop);
    visualViewport?.addEventListener("scroll", publishViewportTop);
    return () => {
      cancelAnimationFrame(frame);
      settleTimers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("scroll", publishViewportTop);
      window.removeEventListener("resize", publishViewportTop);
      window.removeEventListener("orientationchange", settleViewport);
      document.removeEventListener("focusout", settleViewport, true);
      visualViewport?.removeEventListener("resize", publishViewportTop);
      visualViewport?.removeEventListener("scroll", publishViewportTop);
      root.classList.remove("planner-editor-viewport-locked");
      body.classList.remove("planner-editor-viewport-locked");
      if (previousViewportTop)
        root.style.setProperty(
          "--planner-editor-viewport-top",
          previousViewportTop,
          previousViewportTopPriority,
        );
      else root.style.removeProperty("--planner-editor-viewport-top");
      forceLayoutOrigin();
    };
  }, [active]);
}
