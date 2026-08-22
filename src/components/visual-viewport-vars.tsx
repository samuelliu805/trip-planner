"use client";

import { useEffect } from "react";

/** A pinch zoom shrinks the visual viewport too, and must never be mistaken for a keyboard. */
const zoomTolerance = 1.01;
/** Under this there is no keyboard, and a viewport still reporting less than the window is stale. */
const keyboardMinimumPx = 120;

/**
 * Publishes the band the traveller can actually see as CSS variables, so a full-screen surface can
 * be placed against the visual viewport instead of the layout viewport.
 *
 * iPadOS moves the page inside the layout viewport when its keyboard opens, and the offset it
 * leaves behind reports `scrollY` as 0 — nothing can scroll it back. Every attempt to prevent or
 * undo that move failed. Following it does not: a surface pinned to `--visual-viewport-top` with
 * `--visual-viewport-height` stays exactly where the traveller is looking, so its top bar stays at
 * the top and its content stops short of the keyboard, whether or not the page underneath moved.
 *
 * Where the keys are absent — no VisualViewport, or a pinch zoom — every consumer falls back to
 * `100dvh` at the top, which is what these surfaces did before.
 */
export function VisualViewportVars() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    let frame = 0;

    const clear = () => {
      root.style.removeProperty("--visual-viewport-top");
      root.style.removeProperty("--visual-viewport-height");
    };

    const publish = () => {
      frame = 0;
      // A viewport that reports nothing — a background tab, a restore, a zoom — must never be
      // followed: a height of 0 would collapse every surface that tracks it. Clearing the keys
      // hands those surfaces back their `100dvh` fallback, which is only ever too generous.
      if (viewport.scale > zoomTolerance || viewport.height <= 0) {
        clear();
        return;
      }
      // Only a keyboard-sized shortfall is worth following. iPadOS also leaves the viewport
      // reporting a sliver less than the window once its keyboard is gone, and a surface that
      // believed that stood short of the screen — the strip of blank page under the table.
      const keyboard = Math.max(0, window.innerHeight - viewport.height);
      const height = keyboard >= keyboardMinimumPx ? viewport.height : window.innerHeight;
      root.style.setProperty("--visual-viewport-top", `${Math.round(viewport.offsetTop)}px`);
      root.style.setProperty("--visual-viewport-height", `${Math.round(height)}px`);
    };

    // The pan and the keyboard animation both fire in bursts; one write per frame is enough.
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(publish);
    };

    publish();
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    window.addEventListener("orientationchange", schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      window.removeEventListener("orientationchange", schedule);
      clear();
    };
  }, []);

  return null;
}
