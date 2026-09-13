"use client";

import { ArrowDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import { T } from "@/features/i18n/i18n-provider";
import type { AppRegion } from "@/platform/config/provider-matrix";
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
import { initialFragmentRect } from "./route-dock-fragment-layout";
import { useLandingScrollReset, useRouteDockMeasurements } from "./route-dock-layout";

type WorkspaceStyle = CSSProperties & {
  "--dock-target-opacity"?: number;
  "--mobile-workspace-scale"?: number;
};

type FragmentStyle = CSSProperties & {
  "--fragment-index": number;
};

export function RouteDockHero({
  appRegion,
  startHref = "/guest",
}: {
  appRegion: AppRegion;
  startHref?: string;
}) {
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
  const effectiveProgress = effectiveDockProgress(progress, reducedMotion, webglFailed);
  const state = dockState(effectiveProgress);
  const { targets, viewportSize } = useRouteDockMeasurements({
    copyRef,
    layerRef,
    viewportRef,
    workspaceRef,
    measureKey: state,
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

  const destinationOpacity = targetContentOpacity(effectiveProgress);
  const deskProgress = clamp(effectiveProgress / 0.5);
  const workspaceOpacity =
    reducedMotion || webglFailed
      ? 1
      : viewportSize.width < 700
        ? 0.82 + clamp(effectiveProgress / 0.62) * 0.18
        : 0.34 + clamp(effectiveProgress / 0.62) * 0.66;
  const mobileWorkspace =
    viewportSize.width < 700
      ? mobileWorkspaceLayout(
          viewportSize.width,
          viewportSize.visibleHeight,
          viewportSize.copyBottom,
          viewportSize.workspaceHeight,
        )
      : null;
  // Leave a dedicated reading rail below the scene, including on short tablets.
  const desktopScale = Math.min(
    1,
    (viewportSize.visibleHeight - 240) / Math.max(1, viewportSize.workspaceHeight),
  );
  const desktopTop = Math.max(
    132,
    (viewportSize.visibleHeight - viewportSize.workspaceHeight * desktopScale) / 2 + 8,
  );
  const compactStage = viewportSize.width <= 1024;
  const workspaceStyle: WorkspaceStyle = mobileWorkspace
    ? {
        "--dock-target-opacity": destinationOpacity,
        "--mobile-workspace-scale": mobileWorkspace.scale,
        opacity: workspaceOpacity,
        top: mobileWorkspace.top,
        transform: "translateX(-50%)",
        width: mobileWorkspace.width,
      }
    : {
        "--dock-target-opacity": destinationOpacity,
        opacity: workspaceOpacity,
        top: desktopTop,
        transform: `translate3d(0, ${compactStage ? 0 : (1 - deskProgress) * 14}px, 0) rotate(${(-(compactStage ? 2 : 4) * (1 - deskProgress)).toFixed(2)}deg) scale(${desktopScale})`,
      };
  const transforms = useMemo(() => {
    const result: Partial<Record<DockKind, FragmentTransform>> = {};
    for (const kind of dockKinds) {
      const target = targets[kind];
      if (!target) continue;
      const transform = fragmentTransform(
        kind,
        effectiveProgress,
        initialFragmentRect(kind, viewportSize.width, viewportSize.height),
        target,
        viewportSize.width < 700 ? 0.3 : viewportSize.width <= 1024 ? 0.65 : 1,
      );
      if (viewportSize.width <= 1024 && effectiveProgress < 0.7) {
        transform.x = clamp(transform.x, 8, viewportSize.width - transform.width - 12);
      }
      result[kind] = transform;
    }
    return result;
  }, [effectiveProgress, targets, viewportSize]);

  return (
    <section
      className="route-dock-hero"
      data-static={reducedMotion || webglFailed ? "true" : undefined}
    >
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
              <T message="ONE CLEAR PLAN" />
            </p>
            <h1>
              <T message="Ready before you go." />
            </h1>
            <p className="hero-support">
              <T message="Route, stays, days and tickets—all in one plan." />
            </p>
            <div className="hero-actions">
              <Button asChild size="lg">
                <Link href={startHref}>
                  <T message="Start planning" />
                </Link>
              </Button>
            </div>
          </div>
          <div className="workspace-stage" ref={workspaceRef} style={workspaceStyle}>
            <AssembledWorkspace appRegion={appRegion} targetOpacity={1} />
          </div>
          <div className="fragment-layer" ref={layerRef}>
            {dockKinds.map((kind, index) => {
              const transform =
                transforms[kind] ??
                initialFragmentRect(kind, viewportSize.width, viewportSize.height);
              return (
                <div
                  className={`moving-fragment fragment-${kind}`}
                  data-fragment={kind}
                  key={kind}
                  style={
                    {
                      "--fragment-index": index,
                      borderRadius: transform.borderRadius,
                      filter: `blur(${transform.blur}px)`,
                      height: transform.height,
                      left: transform.x,
                      opacity: reducedMotion || webglFailed ? 0 : transform.opacity,
                      top: transform.y,
                      transform: `translate3d(0, 0, ${transform.depth}px) rotate(${transform.rotation}deg) scale(${transform.scale})`,
                      width: transform.width,
                    } as FragmentStyle
                  }
                >
                  <div className="fragment-card-face">
                    <DockContent appRegion={appRegion} kind={kind} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="scene-state" aria-live="polite">
            {(["Ideas scattered", "Details in place", "Ready to go"] as const).map(
              (label, index) => (
                <div
                  key={label}
                  className={
                    (state === "scattered" ? 0 : state === "assembled" ? 2 : 1) === index
                      ? "is-current"
                      : undefined
                  }
                >
                  <span>{["A", "B", "C"][index]}</span>
                  <strong>
                    <T message={label} />
                  </strong>
                </div>
              ),
            )}
          </div>
          <div className="scroll-cue" aria-hidden="true">
            <ArrowDown />
          </div>
        </div>
      </div>
    </section>
  );
}
