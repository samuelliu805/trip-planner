"use client";

import { useLayoutEffect, type RefObject } from "react";

/** Size the transition envelope from its active DOM, never from a scaled screenshot. */
export function useShareStage(stageRef: RefObject<HTMLDivElement | null>, published: boolean) {
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const source = stage?.querySelector<HTMLElement>(".share-planner-source");
    const sheet = stage?.querySelector<HTMLElement>(".landing-public-sheet");
    if (!stage || !source || !sheet) return;
    let active = true;
    const measure = () => {
      const height = (published ? sheet : source).offsetHeight;
      // Ignore border-only measurements while a stylesheet or subtree is arriving.
      if (height > 32) stage.style.height = `${height}px`;
    };
    const observer = new ResizeObserver(measure);
    observer.observe(source);
    observer.observe(sheet);
    measure();
    void document.fonts.ready.then(() => {
      if (active) measure();
    });
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [published, stageRef]);
}
