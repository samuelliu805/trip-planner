"use client";

import { useEffect, useLayoutEffect, useState, type RefObject } from "react";

import { dockKinds, type DockKind } from "./paris-fixture";
import { shouldResetLandingScroll, type DockRect } from "./route-dock-math";

export function useLandingScrollReset() {
  useLayoutEffect(() => {
    if (!shouldResetLandingScroll(window.innerWidth, window.location.hash)) return;
    const previousRestoration = window.history.scrollRestoration;
    const reset = () => window.scrollTo(0, 0);
    window.history.scrollRestoration = "manual";
    reset();
    const frame = window.requestAnimationFrame(reset);
    window.addEventListener("pageshow", reset);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pageshow", reset);
      window.history.scrollRestoration = previousRestoration;
    };
  }, []);
}

export function useRouteDockMeasurements({
  copyRef,
  layerRef,
  viewportRef,
  workspaceRef,
}: {
  copyRef: RefObject<HTMLDivElement | null>;
  layerRef: RefObject<HTMLDivElement | null>;
  viewportRef: RefObject<HTMLDivElement | null>;
  workspaceRef: RefObject<HTMLDivElement | null>;
}) {
  const [targets, setTargets] = useState<Partial<Record<DockKind, DockRect>>>({});
  const [viewportSize, setViewportSize] = useState({
    copyBottom: 0,
    height: 900,
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
        copyBottom: copyRect.bottom - layerRect.top,
        height: layerRect.height,
        width: layerRect.width,
        workspaceHeight: workspace.offsetHeight,
      });
      setTargets(measured);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(layer);
    observer.observe(copy);
    observer.observe(workspace);
    measure();
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [copyRef, layerRef, viewportRef, workspaceRef]);

  return { targets, viewportSize };
}
