"use client";

import { useEffect, useRef } from "react";

import { createRouteDockScene, type PointerPosition } from "./route-dock-scene";

const featureSteps = ["01", "02", "03", "04"] as const;

export function FeatureRouteAtmosphere() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const story = canvas?.parentElement;
    if (!canvas || !story) return;

    let animationFrame = 0;
    let storyFrame = 0;
    let disposed = false;
    let cleanup = () => undefined;
    const pointer: PointerPosition = { x: 0, y: 0 };
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sections = Array.from(story.querySelectorAll<HTMLElement>(".feature-section"));
    const progress = () => {
      const bounds = story.getBoundingClientRect();
      return Math.min(1, Math.max(0, -bounds.top / Math.max(1, bounds.height - innerHeight)));
    };
    const updateStoryState = () => {
      storyFrame = 0;
      const storyProgress = progress();
      let activeStep = "intro";
      sections.forEach((section, index) => {
        if (section.getBoundingClientRect().top <= innerHeight * 0.58) activeStep = String(index);
      });
      story.dataset.featureStep = activeStep;
      story.style.setProperty("--feature-story-progress", storyProgress.toFixed(4));
    };
    const scheduleStoryUpdate = () => {
      if (!storyFrame) storyFrame = requestAnimationFrame(updateStoryState);
    };

    window.addEventListener("scroll", scheduleStoryUpdate, { passive: true });
    window.addEventListener("resize", scheduleStoryUpdate);
    updateStoryState();

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
        let visible = true;

        const draw = (time: number) => {
          routeScene.render(motionQuery.matches ? 1 : progress(), time, pointer);
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
          updateStoryState();
          start();
        };
        const handlePointer = (event: PointerEvent) => {
          if (motionQuery.matches) return;
          pointer.x = (event.clientX / Math.max(1, innerWidth) - 0.5) * 2;
          pointer.y = (event.clientY / Math.max(1, innerHeight) - 0.5) * 2;
          story.style.setProperty("--feature-pointer-offset-x", `${(pointer.x * 18).toFixed(2)}px`);
          story.style.setProperty("--feature-pointer-offset-y", `${(pointer.y * 12).toFixed(2)}px`);
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
      cancelAnimationFrame(storyFrame);
      window.removeEventListener("scroll", scheduleStoryUpdate);
      window.removeEventListener("resize", scheduleStoryUpdate);
      cleanup();
    };
  }, []);

  return (
    <>
      <canvas aria-hidden="true" className="feature-route-atmosphere" ref={canvasRef} />
      <div aria-hidden="true" className="feature-story-rail">
        <span className="feature-story-rail-progress" />
        {featureSteps.map((step, index) => (
          <span data-story-step={index} key={step}>
            {step}
          </span>
        ))}
      </div>
    </>
  );
}
