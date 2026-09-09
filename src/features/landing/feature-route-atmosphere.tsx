"use client";

import { useEffect, useRef } from "react";

import { createRouteDockScene, type PointerPosition } from "./route-dock-scene";

export function FeatureRouteAtmosphere() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const story = canvas?.parentElement;
    if (!canvas || !story) return;

    let animationFrame = 0;
    let disposed = false;
    let cleanup = () => undefined;

    void import("three")
      .then((THREE) => {
        if (disposed) return;
        const renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          canvas,
          powerPreference: "high-performance",
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        const routeScene = createRouteDockScene(THREE);
        const pointer: PointerPosition = { x: 0, y: 0 };
        const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        let visible = true;

        const progress = () => {
          const bounds = story.getBoundingClientRect();
          return Math.min(1, Math.max(0, -bounds.top / Math.max(1, bounds.height - innerHeight)));
        };
        const draw = (time: number) => {
          routeScene.render(progress(), time, pointer);
          renderer.render(routeScene.scene, routeScene.camera);
        };
        const animate = (time: number) => {
          animationFrame = 0;
          if (!visible || disposed) return;
          draw(time);
          if (!motionQuery.matches) animationFrame = requestAnimationFrame(animate);
        };
        const start = () => {
          cancelAnimationFrame(animationFrame);
          animationFrame = 0;
          if (!visible || disposed) return;
          draw(performance.now());
          if (!motionQuery.matches) animationFrame = requestAnimationFrame(animate);
        };
        const resize = () => {
          const width = Math.max(1, canvas.clientWidth);
          const height = Math.max(1, canvas.clientHeight);
          renderer.setSize(width, height, false);
          routeScene.camera.aspect = width / height;
          routeScene.camera.updateProjectionMatrix();
          start();
        };
        const handlePointer = (event: PointerEvent) => {
          if (motionQuery.matches) return;
          pointer.x = (event.clientX / Math.max(1, innerWidth) - 0.5) * 2;
          pointer.y = (event.clientY / Math.max(1, innerHeight) - 0.5) * 2;
        };
        const resizeObserver = new ResizeObserver(resize);
        const intersectionObserver = new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting;
          start();
        });

        resizeObserver.observe(canvas);
        intersectionObserver.observe(story);
        window.addEventListener("pointermove", handlePointer, { passive: true });
        motionQuery.addEventListener("change", start);
        resize();

        cleanup = () => {
          cancelAnimationFrame(animationFrame);
          resizeObserver.disconnect();
          intersectionObserver.disconnect();
          window.removeEventListener("pointermove", handlePointer);
          motionQuery.removeEventListener("change", start);
          routeScene.dispose();
          renderer.dispose();
        };
      })
      .catch(() => {
        if (!disposed) canvas.dataset.webglState = "unavailable";
      });

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return <canvas aria-hidden="true" className="feature-route-atmosphere" ref={canvasRef} />;
}
