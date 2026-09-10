"use client";

import { ArrowDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

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
  mobileWorkspaceLayout,
  scrollProgress,
  targetContentOpacity,
  type FragmentTransform,
} from "./route-dock-math";
import { RouteDockCanvas } from "./route-dock-canvas";
import { useLandingScrollReset, useRouteDockMeasurements } from "./route-dock-layout";

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

type WorkspaceStyle = CSSProperties & {
  "--mobile-workspace-rest-scale"?: number;
  "--mobile-workspace-scale"?: number;
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

export function RouteDockHero({ startHref = "/guest" }: { startHref?: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [webglReady, setWebglReady] = useState(false);
  const [motionReady, setMotionReady] = useState(false);
  const { targets, viewportSize } = useRouteDockMeasurements({
    copyRef,
    layerRef,
    viewportRef,
    workspaceRef,
  });
  const handleWebglFailure = useCallback(() => setWebglFailed(true), []);
  const handleWebglReady = useCallback(() => setWebglReady(true), []);

  useLandingScrollReset();

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
      const viewport = viewportRef.current;
      if (!track || !viewport) return;
      const heroTop = track.getBoundingClientRect().top + window.scrollY;
      setProgress(
        reducedMotion
          ? 1
          : scrollProgress(window.scrollY, heroTop, track.offsetHeight, viewport.offsetHeight),
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

  const effectiveProgress = effectiveDockProgress(progress, reducedMotion, webglFailed);
  const state = dockState(effectiveProgress);
  const destinationOpacity = targetContentOpacity(effectiveProgress);
  const workspaceOpacity =
    reducedMotion || webglFailed ? 1 : clamp((effectiveProgress - 0.32) / 0.23);
  const mobileWorkspace =
    viewportSize.width < 700
      ? mobileWorkspaceLayout(
          viewportSize.width,
          viewportSize.visibleHeight,
          viewportSize.copyBottom,
          viewportSize.workspaceHeight,
        )
      : null;
  const workspaceStyle: WorkspaceStyle = mobileWorkspace
    ? {
        "--mobile-workspace-rest-scale": mobileWorkspace.scale * 0.985,
        "--mobile-workspace-scale": mobileWorkspace.scale,
        opacity: workspaceOpacity,
        top: mobileWorkspace.top,
        width: mobileWorkspace.width,
      }
    : { opacity: workspaceOpacity };
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
    <section className="route-dock-hero">
      <div className="route-dock-canvas-track">
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
      </div>
      <div
        className="route-dock-track"
        data-dock-ready={motionReady ? "true" : "false"}
        data-dock-state={state}
        data-testid="route-dock-hero"
        ref={trackRef}
      >
        <div className="route-dock-viewport" ref={viewportRef}>
          <div className="hero-copy" ref={copyRef}>
            <p className="landing-eyebrow">
              <T message="THE CALM WAY TO PLAN A TRIP" />
            </p>
            <h1>
              <T message="Plan every trip in one place." />
            </h1>
            <p className="hero-support">
              <T message="Build the route, compare your options, keep bookings and tickets close, and share a plan that works on the road." />
            </p>
            <div className="hero-actions">
              <Button asChild size="lg">
                <Link href={startHref}>
                  <T message="Start planning" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="#how-it-works">
                  <T message="See how it works" />
                </Link>
              </Button>
            </div>
            <p className="hero-detail">
              <T message="Timeline, table, map, options and travel documents—finally connected." />
            </p>
          </div>
          <div className="workspace-stage" ref={workspaceRef} style={workspaceStyle}>
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
      </div>
    </section>
  );
}
