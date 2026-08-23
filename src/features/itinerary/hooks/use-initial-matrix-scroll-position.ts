"use client";

import { useEffect, useRef } from "react";

const tabletMatrixQuery = "(min-width: 640px) and (max-width: 1199px)";

/** Starts a newly mounted tablet Matrix at its canonical top-left without chasing later scrolls. */
export function useInitialMatrixScrollPosition<T extends HTMLElement>() {
  const matrixRef = useRef<T>(null);

  useEffect(() => {
    const matrix = matrixRef.current;
    if (!matrix || !window.matchMedia(tabletMatrixQuery).matches) return;

    const reset = () => matrix.scrollTo({ behavior: "auto", left: 0, top: 0 });
    reset();
    const frame = window.requestAnimationFrame(reset);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return matrixRef;
}
