"use client";

import { useEffect, useRef } from "react";

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
  const renderRef = useRef<(progress: number) => void>(() => undefined);
  const progressRef = useRef(progress);
  const visibleRef = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
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
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, canvas });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.setClearColor(0x000000, 0);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
        camera.position.set(0, 0, 8);

        const routeCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(-5.6, 1.9, -0.8),
          new THREE.Vector3(-3.2, -1.1, 0.2),
          new THREE.Vector3(-0.9, 1.2, -0.1),
          new THREE.Vector3(1.5, -0.5, 0.35),
          new THREE.Vector3(4.8, 1.1, -0.55),
        ]);
        const routePoints = routeCurve.getPoints(160);
        const routeGeometry = new THREE.BufferGeometry().setFromPoints(routePoints);
        routeGeometry.setDrawRange(0, 0);
        const routeMaterial = new THREE.LineBasicMaterial({
          color: 0x6fc4bd,
          transparent: true,
          opacity: 0.8,
        });
        const routeLine = new THREE.Line(routeGeometry, routeMaterial);
        scene.add(routeLine);

        const railMaterial = new THREE.LineBasicMaterial({
          color: 0x42737d,
          transparent: true,
          opacity: 0.18,
        });
        const railGeometries: import("three").BufferGeometry[] = [];
        for (const y of [-2.1, 2.1]) {
          const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-6, y, -1.6),
            new THREE.Vector3(6, y, -1.6),
          ]);
          railGeometries.push(geometry);
          scene.add(new THREE.Line(geometry, railMaterial));
        }

        const particleGeometry = new THREE.BufferGeometry();
        const particlePositions = new Float32Array(42 * 3);
        for (let index = 0; index < 42; index += 1) {
          particlePositions[index * 3] = ((index * 47) % 113) / 9 - 6;
          particlePositions[index * 3 + 1] = ((index * 29) % 71) / 10 - 3.5;
          particlePositions[index * 3 + 2] = -1.5 - ((index * 17) % 31) / 12;
        }
        particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
        const particleMaterial = new THREE.PointsMaterial({
          color: 0x90c7b2,
          opacity: 0.28,
          size: 0.035,
          transparent: true,
        });
        const particles = new THREE.Points(particleGeometry, particleMaterial);
        scene.add(particles);

        const completionLight = new THREE.PointLight(0x70d4b4, 0, 12);
        completionLight.position.set(3.2, 0.3, 2);
        scene.add(completionLight);

        const resize = () => {
          const width = Math.max(1, canvas.clientWidth);
          const height = Math.max(1, canvas.clientHeight);
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderRef.current(progressRef.current);
        };
        renderRef.current = (nextProgress) => {
          if (!visibleRef.current || disposed) return;
          const routeProgress = Math.min(1, Math.max(0, (nextProgress - 0.15) / 0.4));
          routeGeometry.setDrawRange(0, Math.round(routePoints.length * routeProgress));
          camera.position.x = nextProgress < 0.8 ? nextProgress * 0.35 : 0.28;
          camera.position.z = 8 - Math.min(nextProgress, 0.8) * 0.45;
          particles.rotation.z = nextProgress * 0.025;
          completionLight.intensity = Math.max(0, 1 - Math.abs(nextProgress - 0.79) * 14) * 1.4;
          renderer.render(scene, camera);
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvas);
        intersectionObserver = new IntersectionObserver(([entry]) => {
          visibleRef.current = entry.isIntersecting;
          if (entry.isIntersecting) renderRef.current(progressRef.current);
        });
        intersectionObserver.observe(canvas);
        resize();
        onReady();
        cleanup = () => {
          resizeObserver?.disconnect();
          intersectionObserver?.disconnect();
          routeGeometry.dispose();
          routeMaterial.dispose();
          railGeometries.forEach((geometry) => geometry.dispose());
          railMaterial.dispose();
          particleGeometry.dispose();
          particleMaterial.dispose();
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
