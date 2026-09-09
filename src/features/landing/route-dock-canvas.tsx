"use client";

import { useEffect, useRef } from "react";

import { createRouteDockScene, type PointerPosition } from "./route-dock-scene";

export function RouteDockCanvas({
  onFailure,
  onReady,
  progress,
}: {
  onFailure: () => void;
  onReady: () => void;
  progress: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef<PointerPosition>({ x: 0, y: 0 });
  const renderRef = useRef<(progress: number) => void>(() => undefined);
  const progressRef = useRef(progress);
  const visibleRef = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let animationFrame = 0;
    let disposed = false;
    let resizeObserver: ResizeObserver | undefined;
    let intersectionObserver: IntersectionObserver | undefined;
    let cleanup: () => void = () => undefined;

    async function initialize() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (
        new URLSearchParams(window.location.search).get("webgl") === "off" ||
        !window.WebGLRenderingContext
      ) {
        onFailure();
        return;
      }
      try {
        const THREE = await import("three");
        if (disposed) return;
        const renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          canvas,
          powerPreference: "high-performance",
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        const routeScene = createRouteDockScene(THREE);
        const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

        const renderScene = (time: number) => {
          if (!visibleRef.current || disposed) return;
          routeScene.render(progressRef.current, time, pointerRef.current);
          renderer.render(routeScene.scene, routeScene.camera);
        };
        const animate = (time: number) => {
          animationFrame = 0;
          renderScene(time);
          if (!disposed && visibleRef.current && !motionQuery.matches)
            animationFrame = window.requestAnimationFrame(animate);
        };
        const startAnimation = () => {
          window.cancelAnimationFrame(animationFrame);
          animationFrame = 0;
          renderScene(performance.now());
          if (visibleRef.current && !motionQuery.matches)
            animationFrame = window.requestAnimationFrame(animate);
        };
        const handlePointerMove = (event: PointerEvent) => {
          if (motionQuery.matches) return;
          pointerRef.current = {
            x: (event.clientX / Math.max(1, window.innerWidth) - 0.5) * 2,
            y: (event.clientY / Math.max(1, window.innerHeight) - 0.5) * 2,
          };
        };
        const resize = () => {
          const width = Math.max(1, canvas.clientWidth);
          const height = Math.max(1, canvas.clientHeight);
          renderer.setSize(width, height, false);
          routeScene.camera.aspect = width / height;
          routeScene.camera.updateProjectionMatrix();
          renderScene(performance.now());
        };
        renderRef.current = (nextProgress) => {
          progressRef.current = nextProgress;
          renderScene(performance.now());
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvas);
        intersectionObserver = new IntersectionObserver(([entry]) => {
          visibleRef.current = entry.isIntersecting;
          if (entry.isIntersecting) startAnimation();
          else window.cancelAnimationFrame(animationFrame);
        });
        intersectionObserver.observe(canvas);
        window.addEventListener("pointermove", handlePointerMove, { passive: true });
        motionQuery.addEventListener("change", startAnimation);
        resize();
        startAnimation();
        onReady();
        cleanup = () => {
          window.cancelAnimationFrame(animationFrame);
          window.removeEventListener("pointermove", handlePointerMove);
          motionQuery.removeEventListener("change", startAnimation);
          resizeObserver?.disconnect();
          intersectionObserver?.disconnect();
          routeScene.dispose();
          renderer.dispose();
        };
      } catch {
        onFailure();
      }
    }
    void initialize();
    return () => {
      disposed = true;
      cleanup();
      renderRef.current = () => undefined;
    };
  }, [onFailure, onReady]);

  useEffect(() => {
    progressRef.current = progress;
    renderRef.current(progress);
  }, [progress]);

  return <canvas aria-hidden="true" data-testid="route-dock-canvas" ref={canvasRef} />;
}
