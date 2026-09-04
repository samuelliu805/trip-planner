"use client";

import { useEffect, useRef } from "react";

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

export function plannerEditorKeyboardOcclusion({
  layoutHeight,
  viewportHeight,
  viewportOffsetTop,
}: {
  layoutHeight: number;
  viewportHeight: number;
  viewportOffsetTop: number;
}) {
  return Math.max(0, layoutHeight - viewportHeight - viewportOffsetTop);
}

/** Keeps the focused control visible when iPadOS changes only the visual viewport for its keyboard. */
export function usePlannerEditorKeyboardScroll() {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const currentSurface = scrollRef.current;
    if (!currentSurface) return;
    const surface: HTMLDivElement = currentSurface;
    const editorForm = surface.closest("form") ?? surface.querySelector("form");
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
      const viewportOffsetTop = viewport?.offsetTop ?? 0;
      const layoutHeight = Math.max(
        surface.clientHeight,
        window.innerHeight,
        document.documentElement.clientHeight,
      );
      const keyboardSpace = plannerEditorKeyboardOcclusion({
        layoutHeight,
        viewportHeight,
        viewportOffsetTop,
      });
      const keyboardOpen = keyboardSpace >= keyboardThreshold;
      editorForm?.toggleAttribute("data-editor-keyboard-open", keyboardOpen);

      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => {
          const currentViewport = window.visualViewport;
          const currentViewportHeight = currentViewport?.height ?? window.innerHeight;
          const viewportTop = currentViewport?.offsetTop ?? 0;
          const currentLayoutHeight = Math.max(
            surface.clientHeight,
            window.innerHeight,
            document.documentElement.clientHeight,
          );
          const currentKeyboardSpace = plannerEditorKeyboardOcclusion({
            layoutHeight: currentLayoutHeight,
            viewportHeight: currentViewportHeight,
            viewportOffsetTop: viewportTop,
          });
          surface.style.setProperty(
            "--planner-editor-keyboard-space",
            keyboardOpen ? `${currentKeyboardSpace + keyboardEdgeClearance}px` : "0px",
          );
          const active = document.activeElement;
          if (!(active instanceof HTMLElement) || !active.matches(editableSelector)) return;
          if (!surface.contains(active)) return;
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
          const maximum = Math.max(0, surface.scrollHeight - surface.clientHeight);
          const nextTop = Math.max(0, Math.min(maximum, surface.scrollTop + delta));
          surface.scrollTo({ behavior: "auto", top: nextTop });
        });
      });
    }

    surface.addEventListener("focusin", revealFocusedControl);
    window.addEventListener("resize", revealFocusedControl);
    window.visualViewport?.addEventListener("resize", revealFocusedControl);
    window.visualViewport?.addEventListener("scroll", revealFocusedControl);
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      regionObserver.disconnect();
      editorForm?.removeAttribute("data-editor-keyboard-open");
      surface.style.removeProperty("--planner-editor-keyboard-space");
      surface.removeEventListener("focusin", revealFocusedControl);
      window.removeEventListener("resize", revealFocusedControl);
      window.visualViewport?.removeEventListener("resize", revealFocusedControl);
      window.visualViewport?.removeEventListener("scroll", revealFocusedControl);
    };
  }, []);

  return scrollRef;
}
