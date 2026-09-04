"use client";

import { useLayoutEffect } from "react";

/** Keeps the public shell pinned while mobile browser chrome changes the visual viewport. */
export function usePublicViewportContainment() {
  useLayoutEffect(() => {
    const visualViewport = window.visualViewport;
    const root = document.documentElement;
    const timers = new Set<number>();
    let animationFrame: number | undefined;
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    function resetDocumentScroll() {
      if (window.scrollX || window.scrollY) window.scrollTo({ left: 0, top: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }

    function syncViewport() {
      const height = visualViewport?.height ?? window.innerHeight;
      const top = visualViewport?.offsetTop ?? 0;
      if (Number.isFinite(height) && height > 0)
        root.style.setProperty("--public-viewport-height", `${Math.round(height)}px`);
      root.style.setProperty("--public-viewport-top", `${Math.max(0, Math.round(top))}px`);
      resetDocumentScroll();
    }

    function stabilizeViewport() {
      if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame);
      for (const timer of timers) window.clearTimeout(timer);
      timers.clear();
      syncViewport();
      animationFrame = window.requestAnimationFrame(() => {
        syncViewport();
        animationFrame = window.requestAnimationFrame(syncViewport);
      });
      for (const delay of [100, 350, 1_000]) {
        const timer = window.setTimeout(() => {
          timers.delete(timer);
          syncViewport();
        }, delay);
        timers.add(timer);
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") stabilizeViewport();
    }

    stabilizeViewport();
    window.addEventListener("resize", syncViewport);
    window.addEventListener("orientationchange", stabilizeViewport);
    window.addEventListener("scroll", resetDocumentScroll, { passive: true });
    window.addEventListener("pageshow", stabilizeViewport);
    window.addEventListener("focus", stabilizeViewport);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    visualViewport?.addEventListener("resize", syncViewport);
    visualViewport?.addEventListener("scroll", syncViewport);

    return () => {
      if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame);
      for (const timer of timers) window.clearTimeout(timer);
      root.style.removeProperty("--public-viewport-height");
      root.style.removeProperty("--public-viewport-top");
      window.history.scrollRestoration = previousScrollRestoration;
      window.removeEventListener("resize", syncViewport);
      window.removeEventListener("orientationchange", stabilizeViewport);
      window.removeEventListener("scroll", resetDocumentScroll);
      window.removeEventListener("pageshow", stabilizeViewport);
      window.removeEventListener("focus", stabilizeViewport);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      visualViewport?.removeEventListener("resize", syncViewport);
      visualViewport?.removeEventListener("scroll", syncViewport);
    };
  }, []);
}
