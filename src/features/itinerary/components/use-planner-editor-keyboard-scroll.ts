"use client";

import { useEffect, useRef } from "react";

const editableSelector =
  "input:not([type='hidden']), textarea, select, [role='combobox'], [contenteditable='true']";

const keyboardThreshold = 120;
const keyboardEdgeClearance = 32;
const keyboardSettleDelays = [0, 80, 240, 500];

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
export function usePlannerEditorKeyboardScroll() {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const currentSurface = scrollRef.current;
    if (!currentSurface) return;
    const surface: HTMLDivElement = currentSurface;
    const editorForm = surface.closest("form") ?? surface.querySelector("form");
    let firstFrame = 0;
    let secondFrame = 0;
    let focusFrame = 0;
    let focusSessionScrollTop: number | null = null;
    let keyboardObserved = false;
    let observedRegion: Element | null = null;
    const settleTimers = new Set<number>();
    const regionObserver = new ResizeObserver(() => revealFocusedControl());

    const clearSettleTimers = () => {
      settleTimers.forEach((timer) => window.clearTimeout(timer));
      settleTimers.clear();
    };

    const observeFocusedRegion = (active: HTMLElement) => {
      const nextRegion = active.closest("[data-planner-focus-region]");
      if (nextRegion === observedRegion) return;
      regionObserver.disconnect();
      observedRegion = nextRegion;
      if (observedRegion) regionObserver.observe(observedRegion);
    };

    const editorOwnsEditable = (target: EventTarget | null) => {
      const element = target instanceof HTMLElement ? target : null;
      return Boolean(element?.matches(editableSelector) && surface.contains(element));
    };

    const restoreFocusSessionScroll = () => {
      if (!keyboardObserved || focusSessionScrollTop === null) return;
      const restoreTop = focusSessionScrollTop;
      keyboardObserved = false;
      focusSessionScrollTop = null;
      regionObserver.disconnect();
      observedRegion = null;
      editorForm?.removeAttribute("data-editor-keyboard-open");
      surface.style.setProperty("--planner-editor-keyboard-space", "0px");
      keyboardSettleDelays.forEach((delay) => {
        const timer = window.setTimeout(() => {
          settleTimers.delete(timer);
          const maximum = Math.max(0, surface.scrollHeight - surface.clientHeight);
          surface.scrollTo({ behavior: "auto", top: Math.min(restoreTop, maximum) });
        }, delay);
        settleTimers.add(timer);
      });
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!editorOwnsEditable(event.target)) return;
      clearSettleTimers();
      if (focusSessionScrollTop === null) focusSessionScrollTop = surface.scrollTop;
      revealFocusedControl();
    };

    const handleFocusOut = () => {
      cancelAnimationFrame(focusFrame);
      focusFrame = requestAnimationFrame(() => {
        if (editorOwnsEditable(document.activeElement)) return;
        if (keyboardObserved) restoreFocusSessionScroll();
        else {
          focusSessionScrollTop = null;
          regionObserver.disconnect();
          observedRegion = null;
        }
      });
    };

    function revealFocusedControl() {
      const viewport = window.visualViewport;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const keyboardOpen = surface.clientHeight - viewportHeight >= keyboardThreshold;
      if (keyboardOpen) keyboardObserved = true;
      else if (keyboardObserved) {
        restoreFocusSessionScroll();
        return;
      }
      editorForm?.toggleAttribute("data-editor-keyboard-open", keyboardOpen);

      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => {
          const currentViewport = window.visualViewport;
          const currentViewportHeight = currentViewport?.height ?? window.innerHeight;
          const viewportTop = currentViewport?.offsetTop ?? 0;
          const keyboardSpace = Math.max(0, surface.clientHeight - currentViewportHeight);
          surface.style.setProperty(
            "--planner-editor-keyboard-space",
            keyboardOpen ? `${keyboardSpace + keyboardEdgeClearance}px` : "0px",
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

    surface.addEventListener("focusin", handleFocusIn);
    surface.addEventListener("focusout", handleFocusOut);
    window.addEventListener("resize", revealFocusedControl);
    window.visualViewport?.addEventListener("resize", revealFocusedControl);
    window.visualViewport?.addEventListener("scroll", revealFocusedControl);
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      cancelAnimationFrame(focusFrame);
      clearSettleTimers();
      regionObserver.disconnect();
      editorForm?.removeAttribute("data-editor-keyboard-open");
      surface.style.removeProperty("--planner-editor-keyboard-space");
      surface.removeEventListener("focusin", handleFocusIn);
      surface.removeEventListener("focusout", handleFocusOut);
      window.removeEventListener("resize", revealFocusedControl);
      window.visualViewport?.removeEventListener("resize", revealFocusedControl);
      window.visualViewport?.removeEventListener("scroll", revealFocusedControl);
    };
  }, []);

  return scrollRef;
}
