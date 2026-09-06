"use client";

import { ArrowDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { T } from "@/features/i18n/i18n-provider";
import Link from "next/link";

import { AssembledWorkspace } from "./assembled-workspace";
import { DockContent } from "./dock-content";
import { dockKinds, type DockKind } from "./paris-fixture";
import {
  clamp,
  dockState,
  effectiveDockProgress,
  fragmentTransform,
  scrollProgress,
  targetContentOpacity,
  type DockRect,
  type FragmentTransform,
} from "./route-dock-math";
import { RouteDockCanvas } from "./route-dock-canvas";

const starts: Record<DockKind, FragmentTransform> = {
  route: {
    x: 0,
    y: 0,
    width: 238,
    height: 88,
    scale: 1,
    rotation: -5,
    borderRadius: 16,
    opacity: 1,
  },
  stay: { x: 0, y: 0, width: 220, height: 78, scale: 1, rotation: 3, borderRadius: 16, opacity: 1 },
  activity: {
    x: 0,
    y: 0,
    width: 216,
    height: 78,
    scale: 1,
    rotation: -2,
    borderRadius: 16,
    opacity: 1,
  },
  document: {
    x: 0,
    y: 0,
    width: 226,
    height: 82,
    scale: 1,
    rotation: 4,
    borderRadius: 16,
    opacity: 1,
  },
};

function initialRect(kind: DockKind, width: number, height: number): FragmentTransform {
  const mobile = width < 700;
  const index = dockKinds.indexOf(kind);
  const columns = mobile ? 2 : 1;
  const row = Math.floor(index / columns);
  const column = index % columns;
  const base = starts[kind];
  const fragmentWidth = mobile ? Math.min(base.width, width * 0.4) : base.width;
  return {
    ...base,
    width: fragmentWidth,
    height: mobile ? 70 : base.height,
    x: mobile ? width * 0.08 + column * (width * 0.44) : width * 0.58 + (index % 2) * 44,
    y: mobile ? height * 0.57 + row * 86 : height * 0.22 + index * 104,
  };
}

export function RouteDockHero() {
  const trackRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [webglReady, setWebglReady] = useState(false);
  const [motionReady, setMotionReady] = useState(false);
  const [targets, setTargets] = useState<Partial<Record<DockKind, DockRect>>>({});
  const [viewportSize, setViewportSize] = useState({ height: 900, width: 1440 });
  const handleWebglFailure = useCallback(() => setWebglFailed(true), []);
  const handleWebglReady = useCallback(() => setWebglReady(true), []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMotionReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const track = trackRef.current;
      if (!track) return;
      const heroTop = track.getBoundingClientRect().top + window.scrollY;
      setProgress(
        reducedMotion
          ? 1
          : scrollProgress(window.scrollY, heroTop, track.offsetHeight, window.innerHeight),
      );
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [reducedMotion]);

  useEffect(() => {
    const layer = layerRef.current;
    const viewport = viewportRef.current;
    if (!layer || !viewport) return;
    const measure = () => {
      const layerRect = layer.getBoundingClientRect();
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
      setViewportSize({ height: layerRect.height, width: layerRect.width });
      setTargets(measured);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(layer);
    measure();
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, []);

  const effectiveProgress = effectiveDockProgress(progress, reducedMotion, webglFailed);
  const state = dockState(effectiveProgress);
  const destinationOpacity = targetContentOpacity(effectiveProgress);
  const workspaceOpacity =
    reducedMotion || webglFailed ? 1 : clamp((effectiveProgress - 0.32) / 0.23);
  const transforms = useMemo(() => {
    const result: Partial<Record<DockKind, FragmentTransform>> = {};
    for (const kind of dockKinds) {
      const target = targets[kind];
      if (!target) continue;
      result[kind] = fragmentTransform(
        kind,
        effectiveProgress,
        initialRect(kind, viewportSize.width, viewportSize.height),
        target,
      );
    }
    return result;
  }, [effectiveProgress, targets, viewportSize]);

  return (
    <section
      className="route-dock-track"
      data-dock-ready={motionReady ? "true" : "false"}
      data-dock-state={state}
      data-testid="route-dock-hero"
      ref={trackRef}
    >
      <div className="route-dock-viewport" ref={viewportRef}>
        <div
          className="route-dock-canvas"
          data-webgl-state={webglFailed ? "fallback" : webglReady ? "ready" : "loading"}
        >
          <RouteDockCanvas
            onFailure={handleWebglFailure}
            onReady={handleWebglReady}
            progress={effectiveProgress}
          />
        </div>
        <div className="hero-copy">
          <p className="landing-eyebrow">
            <T message="THE CALM WAY TO PLAN A TRIP" />
          </p>
          <h1>
            <T message="Every trip, docked in one place." />
          </h1>
          <p className="hero-support">
            <T message="Build the route, compare your options, keep bookings and tickets close, and share a plan that works on the road." />
          </p>
          <div className="hero-actions">
            <Button asChild size="lg">
              <Link href="/guest">
                <T message="Start planning" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="#sample-trip">
                <T message="Explore a sample trip" />
              </Link>
            </Button>
          </div>
          <p className="hero-detail">
            <T message="Timeline, table, map, options and travel documents—finally connected." />
          </p>
        </div>
        <div className="workspace-stage" style={{ opacity: workspaceOpacity }}>
          <AssembledWorkspace targetOpacity={destinationOpacity} />
        </div>
        <div className="fragment-layer" ref={layerRef}>
          {dockKinds.map((kind) => {
            const transform =
              transforms[kind] ?? initialRect(kind, viewportSize.width, viewportSize.height);
            return (
              <div
                className={`moving-fragment fragment-${kind}`}
                data-fragment={kind}
                key={kind}
                style={{
                  borderRadius: transform.borderRadius,
                  height: transform.height,
                  left: transform.x,
                  opacity: reducedMotion || webglFailed ? 0 : transform.opacity,
                  top: transform.y,
                  transform: `rotate(${transform.rotation}deg) scale(${transform.scale})`,
                  width: transform.width,
                }}
              >
                <DockContent kind={kind} />
              </div>
            );
          })}
        </div>
        <div className="completion-label" aria-hidden={state !== "assembled"}>
          <span>
            <T message="EVERYTHING IN ONE TRIP" />
          </span>
          <strong>
            <T message="Timeline · Map · Options · Documents" />
          </strong>
        </div>
        <div className="scroll-cue" aria-hidden="true">
          <ArrowDown />
        </div>
      </div>
    </section>
  );
}
