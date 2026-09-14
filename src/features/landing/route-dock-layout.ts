"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

import { dockKinds, type DockKind } from "./paris-fixture";
import { shouldResetLandingScroll, type DockRect } from "./route-dock-math";

export function useLandingScrollReset() {
  useLayoutEffect(() => {
    if (!shouldResetLandingScroll(window.innerWidth, window.location.hash)) return;
    const previousRestoration = window.history.scrollRestoration;
    let hasReset = false;
    const resetOnce = () => {
      if (hasReset) return;
      hasReset = true;
      window.scrollTo(0, 0);
    };
    window.history.scrollRestoration = "manual";
    const frame = window.requestAnimationFrame(resetOnce);
    window.addEventListener("pageshow", resetOnce);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pageshow", resetOnce);
      window.history.scrollRestoration = previousRestoration;
    };
  }, []);
}

export function useRouteDockMeasurements({
  copyRef,
  layerRef,
  viewportRef,
  workspaceRef,
  measureKey,
}: {
  copyRef: RefObject<HTMLDivElement | null>;
  layerRef: RefObject<HTMLDivElement | null>;
  viewportRef: RefObject<HTMLDivElement | null>;
  workspaceRef: RefObject<HTMLDivElement | null>;
  measureKey: string;
}) {
  const stableViewportRef = useRef({ height: 0, width: 0 });
  const [hasMeasured, setHasMeasured] = useState(false);
  const [targets, setTargets] = useState<Partial<Record<DockKind, DockRect>>>({});
  const [viewportSize, setViewportSize] = useState({
    coarsePointer: false,
    copyBottom: 0,
    height: 900,
    visibleHeight: 900,
    width: 1440,
    workspaceHeight: 410,
  });

  useEffect(() => {
    const copy = copyRef.current;
    const layer = layerRef.current;
    const viewport = viewportRef.current;
    const workspace = workspaceRef.current;
    if (!copy || !layer || !viewport || !workspace) return;
    const measure = () => {
      const layerRect = layer.getBoundingClientRect();
      const copyRect = copy.getBoundingClientRect();
      const rawVisibleHeight = window.visualViewport?.height ?? window.innerHeight;
      const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
      let visibleHeight = rawVisibleHeight;
      if (layerRect.width <= 1024 || coarsePointer) {
        const stable = stableViewportRef.current;
        if (!stable.height || Math.abs(stable.width - layerRect.width) > 2) {
          stableViewportRef.current = { height: rawVisibleHeight, width: layerRect.width };
        } else {
          stable.height = Math.min(stable.height, rawVisibleHeight);
        }
        visibleHeight = stableViewportRef.current.height;
      }
      const measured: Partial<Record<DockKind, DockRect>> = {};
      for (const kind of dockKinds) {
        const target = viewport.querySelector<HTMLElement>(`[data-dock-target="${kind}"]`);
        if (!target) continue;
        const rect = target.getBoundingClientRect();
        measured[kind] = {
          x: rect.left - layerRect.left,
          y: rect.top - layerRect.top,
          width: rect.width,
          height: rect.height,
        };
      }
      setViewportSize({
        coarsePointer,
        copyBottom: copyRect.bottom - layerRect.top,
        height: layerRect.height,
        visibleHeight,
        width: layerRect.width,
        workspaceHeight: workspace.offsetHeight,
      });
      setTargets(measured);
      setHasMeasured(true);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(layer);
    observer.observe(copy);
    observer.observe(workspace);
    measure();
    let active = true;
    void document.fonts.ready.then(() => {
      if (active) measure();
    });
    const settledFrame = window.requestAnimationFrame(measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      active = false;
      window.cancelAnimationFrame(settledFrame);
      observer.disconnect();
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [copyRef, layerRef, measureKey, viewportRef, workspaceRef]);

  return { hasMeasured, targets, viewportSize };
}
