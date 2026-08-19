"use client";

import { useEffect } from "react";

// iOS/iPadOS reveals a focused field by shifting the visual viewport inside the layout
// viewport. A fixed, non-scrolling shell cannot undo that with window.scrollTo, so the app
// bar slides out of view and a blank strip appears under the workspace once the keyboard
// collapses. Publishing the visual viewport geometry lets the shell follow it instead.
const SETTLE_DELAYS = [0, 60, 200, 420, 800];
const OBSCURED_TOLERANCE_PX = 8;
const VIEWPORT_HEIGHT = "--app-viewport-height";
const VIEWPORT_TOP = "--app-viewport-top";

export function useAppViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const visualViewport = window.visualViewport;
    const timers = new Set<number>();

    function publish(property: string, value: number | null) {
      // Compare against the DOM, not a cached number, so an outside change self-heals.
      const next = value === null ? "" : `${value}px`;
      if (root.style.getPropertyValue(property) === next) return;
      if (value === null) root.style.removeProperty(property);
      else root.style.setProperty(property, next);
    }

    function resetDocumentScroll() {
      if (window.scrollX || window.scrollY) window.scrollTo({ left: 0, top: 0, behavior: "auto" });
      if (root.scrollTop) root.scrollTop = 0;
      if (document.body.scrollTop) document.body.scrollTop = 0;
    }

    // Measuring reads viewport geometry only, so it runs inline on the event rather than in
    // a rAF callback that a throttled or backgrounded tab may never deliver.
    function measure() {
      // Pinch zoom also offsets and shrinks the visual viewport; let the browser own that.
      const pinchZoomed = (visualViewport?.scale ?? 1) > 1.01;
      const layoutHeight = Math.round(window.innerHeight);
      const height =
        visualViewport && !pinchZoomed ? Math.round(visualViewport.height) : layoutHeight;
      const top = pinchZoomed ? 0 : Math.max(0, Math.round(visualViewport?.offsetTop ?? 0));
      // Only override while something (a keyboard, a collapsing URL bar) is actually
      // covering or shifting the layout viewport. Otherwise clear the properties so the
      // shell falls back to plain 100dvh and a stale measurement can never strand it.
      const obscured = layoutHeight - height > OBSCURED_TOLERANCE_PX || top > 0;
      publish(VIEWPORT_HEIGHT, obscured ? height : null);
      publish(VIEWPORT_TOP, obscured ? top : null);
      resetDocumentScroll();
    }

    // Safari reports its final geometry several frames after the keyboard animation ends,
    // and a rotate or window resize can deliver one event carrying mid-transition numbers.
    function settleAfterKeyboard() {
      measure();
      SETTLE_DELAYS.forEach((delay) => {
        const timer = window.setTimeout(() => {
          timers.delete(timer);
          measure();
        }, delay);
        timers.add(timer);
      });
    }

    measure();
    window.addEventListener("resize", settleAfterKeyboard);
    window.addEventListener("orientationchange", settleAfterKeyboard);
    window.addEventListener("pageshow", settleAfterKeyboard);
    window.addEventListener("scroll", measure, { passive: true });
    document.addEventListener("focusin", settleAfterKeyboard, true);
    document.addEventListener("focusout", settleAfterKeyboard, true);
    visualViewport?.addEventListener("resize", settleAfterKeyboard);
    visualViewport?.addEventListener("scroll", measure);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("resize", settleAfterKeyboard);
      window.removeEventListener("orientationchange", settleAfterKeyboard);
      window.removeEventListener("pageshow", settleAfterKeyboard);
      window.removeEventListener("scroll", measure);
      document.removeEventListener("focusin", settleAfterKeyboard, true);
      document.removeEventListener("focusout", settleAfterKeyboard, true);
      visualViewport?.removeEventListener("resize", settleAfterKeyboard);
      visualViewport?.removeEventListener("scroll", measure);
      root.style.removeProperty(VIEWPORT_HEIGHT);
      root.style.removeProperty(VIEWPORT_TOP);
    };
  }, []);
}
