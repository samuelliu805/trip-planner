"use client";

import { useEffect } from "react";

/** A pinch zoom shrinks the visual viewport too, and must never be mistaken for a keyboard. */
const zoomTolerance = 1.01;
/**
 * iPad Chrome reports a visual viewport ~84px shorter than the window with no keyboard on screen at
 * all, so a shortfall has to clear that noise by a wide margin before it counts as one. A real
 * keyboard takes closer to 400px.
 */
const keyboardMinimumPx = 160;

/**
 * Publishes what the traveller can see, measured on device rather than inferred:
 *
 * - `--visual-viewport-top` follows the page. iPadOS moves the page inside the layout viewport
 *   while its keyboard is open — `offsetTop` reaches ~111px — which is what carried the app bar out
 *   of reach. It does return to 0 once the keyboard goes, so the move is only ever transient.
 * - `--visual-viewport-height` is the window's own height, held at the tallest reading seen. It is
 *   deliberately *not* `visualViewport.height`: that runs ~84px short even with no keyboard, and
 *   `100dvh` follows it, which is the strip of blank page under the table. A single transitional
 *   reading must not be able to shrink it either, hence the high-water mark.
 * - `--keyboard-inset` is what the keyboard actually covers, for the surfaces that must sit above
 *   it. Nothing should shrink itself to the leftover band: with the keyboard up that band is about
 *   195px, which fits one field and no form at all.
 */
export function VisualViewportVars() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    let frame = 0;
    let baseline = 0;

    const clear = () => {
      root.style.removeProperty("--visual-viewport-top");
      root.style.removeProperty("--visual-viewport-height");
      root.style.removeProperty("--keyboard-inset");
    };

    const publish = () => {
      frame = 0;
      // A viewport that reports nothing — a background tab, a restore, a zoom — must never be
      // followed: it would collapse every surface that tracks it. Clearing the keys hands those
      // surfaces back their `100dvh` fallback, which is only ever too generous.
      if (viewport.scale > zoomTolerance || viewport.height <= 0 || window.innerHeight <= 0) {
        clear();
        return;
      }

      // The window itself shrinks while the keyboard is up, so only ever let the baseline grow.
      baseline = Math.max(baseline, window.innerHeight);
      const shortfall = baseline - viewport.height;
      const keyboard = shortfall >= keyboardMinimumPx ? shortfall : 0;
      root.style.setProperty("--visual-viewport-top", `${Math.round(viewport.offsetTop)}px`);
      root.style.setProperty("--visual-viewport-height", `${Math.round(baseline)}px`);
      root.style.setProperty("--keyboard-inset", `${Math.round(keyboard)}px`);
    };

    // The pan and the keyboard animation both fire in bursts; one write per frame is enough.
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(publish);
    };

    // A rotation is the one time the window legitimately gets shorter, so the mark starts over.
    const restart = () => {
      baseline = 0;
      schedule();
    };

    publish();
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", restart);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", restart);
      clear();
    };
  }, []);

  return null;
}
