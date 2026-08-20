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

/** Keeps the focused control visible when iPadOS changes only the visual viewport for its keyboard. */
export function usePlannerEditorKeyboardScroll() {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const surface = scrollRef.current;
    if (!surface) return;
    let firstFrame = 0;
    let secondFrame = 0;

    const revealFocusedControl = () => {
      const viewport = window.visualViewport;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const viewportTop = viewport?.offsetTop ?? 0;
      const keyboardSpace = Math.max(0, surface.clientHeight - viewportHeight);
      const keyboardOpen = keyboardSpace >= keyboardThreshold;
      surface.style.setProperty(
        "--planner-editor-keyboard-space",
        keyboardOpen ? `${keyboardSpace + keyboardEdgeClearance}px` : "0px",
      );

      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => {
          const active = document.activeElement;
          if (!(active instanceof HTMLElement) || !active.matches(editableSelector)) return;
          if (!surface.contains(active)) return;
          const topClearance = keyboardOpen ? 20 : 12;
          const bottomClearance = keyboardOpen ? keyboardEdgeClearance : 20;
          const delta = revealDelta(
            active.getBoundingClientRect(),
            viewportTop + topClearance,
            viewportTop + viewportHeight - bottomClearance,
          );
          if (Math.abs(delta) > 1) surface.scrollBy({ behavior: "auto", top: delta });
        });
      });
    };

    surface.addEventListener("focusin", revealFocusedControl);
    window.addEventListener("resize", revealFocusedControl);
    window.visualViewport?.addEventListener("resize", revealFocusedControl);
    window.visualViewport?.addEventListener("scroll", revealFocusedControl);
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      surface.style.removeProperty("--planner-editor-keyboard-space");
      surface.removeEventListener("focusin", revealFocusedControl);
      window.removeEventListener("resize", revealFocusedControl);
      window.visualViewport?.removeEventListener("resize", revealFocusedControl);
      window.visualViewport?.removeEventListener("scroll", revealFocusedControl);
    };
  }, []);

  return scrollRef;
}
