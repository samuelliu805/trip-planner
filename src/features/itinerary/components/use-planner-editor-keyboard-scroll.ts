"use client";

import { useEffect, useRef } from "react";

const editableSelector =
  "input:not([type='hidden']), textarea, select, [role='combobox'], [contenteditable='true']";

/** Keeps the focused control visible when iPadOS changes only the visual viewport for its keyboard. */
export function usePlannerEditorKeyboardScroll() {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const surface = scrollRef.current;
    if (!surface) return;
    let firstFrame = 0;
    let secondFrame = 0;

    const revealFocusedControl = () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => {
          const active = document.activeElement;
          if (!(active instanceof HTMLElement) || !active.matches(editableSelector)) return;
          if (!surface.contains(active)) return;
          active.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        });
      });
    };

    surface.addEventListener("focusin", revealFocusedControl);
    window.visualViewport?.addEventListener("resize", revealFocusedControl);
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      surface.removeEventListener("focusin", revealFocusedControl);
      window.visualViewport?.removeEventListener("resize", revealFocusedControl);
    };
  }, []);

  return scrollRef;
}
