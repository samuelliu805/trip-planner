"use client";

import { useCallback, useEffect, useState } from "react";

const editableSelector =
  "input:not([type='hidden']), textarea, select, [role='combobox'], [contenteditable='true']";

const keyboardThreshold = 120;
const keyboardEdgeClearance = 32;

function revealDelta(
  field: Pick<DOMRect, "bottom" | "top">,
  visibleTop: number,
  visibleBottom: number,
) {
  if (field.bottom > visibleBottom) return field.bottom - visibleBottom;
  if (field.top < visibleTop) return field.top - visibleTop;
  return 0;
}

/** Keeps the focused control visible when iPadOS changes only the visual viewport for its keyboard. */
export function usePlannerEditorKeyboardScroll(active = true) {
  const [surface, setSurface] = useState<HTMLDivElement | null>(null);
  const scrollRef = useCallback((node: HTMLDivElement | null) => setSurface(node), []);

  useEffect(() => {
    if (!active) return;
    if (!surface) return;
    const scrollSurface: HTMLDivElement = surface;
    let firstFrame = 0;
    let secondFrame = 0;
    let observedRegion: Element | null = null;
    const regionObserver = new ResizeObserver(() => revealFocusedControl());

    const observeFocusedRegion = (active: HTMLElement) => {
      const nextRegion = active.closest("[data-planner-focus-region]");
      if (nextRegion === observedRegion) return;
      regionObserver.disconnect();
      observedRegion = nextRegion;
      if (observedRegion) regionObserver.observe(observedRegion);
    };

    function revealFocusedControl() {
      const viewport = window.visualViewport;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const editorHeight =
        scrollSurface.closest<HTMLElement>(".planner-item-dialog")?.clientHeight ??
        scrollSurface.clientHeight;
      const keyboardOpen = editorHeight - viewportHeight >= keyboardThreshold;
      const ownerForm = scrollSurface.closest("form") ?? scrollSurface.querySelector("form");
      ownerForm?.toggleAttribute("data-editor-keyboard-open", keyboardOpen);

      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => {
          const currentViewport = window.visualViewport;
          const currentViewportHeight = currentViewport?.height ?? window.innerHeight;
          const viewportTop = currentViewport?.offsetTop ?? 0;
          const currentEditorHeight =
            scrollSurface.closest<HTMLElement>(".planner-item-dialog")?.clientHeight ??
            scrollSurface.clientHeight;
          const keyboardSpace = Math.max(0, currentEditorHeight - currentViewportHeight);
          scrollSurface.style.setProperty(
            "--planner-editor-keyboard-space",
            keyboardOpen ? `${keyboardSpace + keyboardEdgeClearance}px` : "0px",
          );
          const active = document.activeElement;
          if (!(active instanceof HTMLElement) || !active.matches(editableSelector)) return;
          if (!scrollSurface.contains(active)) return;
          observeFocusedRegion(active);
          const topClearance = keyboardOpen ? 20 : 12;
          const bottomClearance = keyboardOpen ? keyboardEdgeClearance : 20;
          const visibleTop = viewportTop + topClearance;
          const visibleBottom = viewportTop + currentViewportHeight - bottomClearance;
          const region = active.closest<HTMLElement>("[data-planner-focus-region]");
          const target =
            region && region.getBoundingClientRect().height <= visibleBottom - visibleTop
              ? region
              : active;
          const delta = revealDelta(target.getBoundingClientRect(), visibleTop, visibleBottom);
          if (Math.abs(delta) <= 1) return;
          const maximum = Math.max(0, scrollSurface.scrollHeight - scrollSurface.clientHeight);
          const nextTop = Math.max(0, Math.min(maximum, scrollSurface.scrollTop + delta));
          scrollSurface.scrollTo({ behavior: "auto", top: nextTop });
        });
      });
    }

    scrollSurface.addEventListener("focusin", revealFocusedControl);
    window.addEventListener("resize", revealFocusedControl);
    window.visualViewport?.addEventListener("resize", revealFocusedControl);
    window.visualViewport?.addEventListener("scroll", revealFocusedControl);
    // A portalled editor can mount after the keyboard has already changed the visual viewport.
    revealFocusedControl();
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      regionObserver.disconnect();
      (scrollSurface.closest("form") ?? scrollSurface.querySelector("form"))?.removeAttribute(
        "data-editor-keyboard-open",
      );
      scrollSurface.style.removeProperty("--planner-editor-keyboard-space");
      scrollSurface.removeEventListener("focusin", revealFocusedControl);
      window.removeEventListener("resize", revealFocusedControl);
      window.visualViewport?.removeEventListener("resize", revealFocusedControl);
      window.visualViewport?.removeEventListener("scroll", revealFocusedControl);
    };
  }, [active, surface]);

  return scrollRef;
}
