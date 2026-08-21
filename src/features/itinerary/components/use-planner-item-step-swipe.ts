"use client";

import { useEffect, useRef } from "react";

type Gesture = {
  dragging: boolean;
  startX: number;
  startedAt: number;
  startY: number;
};

const interactiveTarget =
  "input, textarea, select, button, a, [role='combobox'], [contenteditable='true'], [data-no-step-swipe]";

/** Horizontal direct manipulation for the editor while leaving fields and vertical scroll alone. */
export function usePlannerItemStepSwipe(onNavigate: (offset: -1 | 1) => boolean) {
  const gestureSurfaceRef = useRef<HTMLDivElement>(null);
  const motionSurfaceRef = useRef<HTMLDivElement>(null);
  const onNavigateRef = useRef(onNavigate);

  useEffect(() => {
    onNavigateRef.current = onNavigate;
  }, [onNavigate]);

  useEffect(() => {
    const gestureSurface = gestureSurfaceRef.current;
    const motionSurface = motionSurfaceRef.current;
    if (!gestureSurface || !motionSurface) return;
    let gesture: Gesture | undefined;
    let animationTimer = 0;
    let suppressClickUntil = 0;

    const clearMotion = () => {
      motionSurface.style.removeProperty("opacity");
      motionSurface.style.removeProperty("transform");
      motionSurface.style.removeProperty("transition");
      motionSurface.style.removeProperty("user-select");
      motionSurface.style.removeProperty("will-change");
      motionSurface.removeAttribute("data-step-dragging");
    };
    const begin = (clientX: number, clientY: number, target: EventTarget | null) => {
      if (target instanceof Element && target.closest(interactiveTarget)) return;
      window.clearTimeout(animationTimer);
      clearMotion();
      gesture = {
        dragging: false,
        startX: clientX,
        startedAt: performance.now(),
        startY: clientY,
      };
    };
    const move = (clientX: number, clientY: number, preventDefault: () => void) => {
      if (!gesture) return;
      const x = clientX - gesture.startX;
      const y = clientY - gesture.startY;
      if (!gesture.dragging) {
        if (Math.max(Math.abs(x), Math.abs(y)) < 8) return;
        if (Math.abs(y) >= Math.abs(x)) {
          gesture = undefined;
          return;
        }
        gesture.dragging = true;
        motionSurface.setAttribute("data-step-dragging", "");
        motionSurface.style.transition = "none";
        motionSurface.style.userSelect = "none";
        motionSurface.style.willChange = "transform, opacity";
      }
      preventDefault();
      const offset = Math.max(-112, Math.min(112, x * 0.9));
      motionSurface.style.transform = `translate3d(${offset}px, 0, 0)`;
      motionSurface.style.opacity = String(1 - Math.min(0.14, Math.abs(offset) / 680));
    };
    const settle = (clientX: number) => {
      const current = gesture;
      gesture = undefined;
      if (!current?.dragging) return;
      suppressClickUntil = performance.now() + 350;
      const distance = clientX - current.startX;
      const elapsed = Math.max(1, performance.now() - current.startedAt);
      const velocity = Math.abs(distance) / elapsed;
      const direction: -1 | 1 = distance < 0 ? 1 : -1;
      const shouldNavigate =
        Math.abs(distance) >= 48 || (Math.abs(distance) >= 22 && velocity > 0.35);

      motionSurface.style.transition = shouldNavigate
        ? "transform 110ms cubic-bezier(0.32, 0.72, 0, 1), opacity 110ms ease-out"
        : "transform 190ms cubic-bezier(0.22, 1, 0.36, 1), opacity 170ms ease-out";
      motionSurface.style.transform = shouldNavigate
        ? `translate3d(${direction === 1 ? -112 : 112}px, 0, 0)`
        : "translate3d(0, 0, 0)";
      motionSurface.style.opacity = shouldNavigate ? "0.2" : "1";

      animationTimer = window.setTimeout(
        () => {
          if (!shouldNavigate || !onNavigateRef.current(direction)) {
            motionSurface.style.transition =
              "transform 190ms cubic-bezier(0.22, 1, 0.36, 1), opacity 170ms ease-out";
            motionSurface.style.transform = "translate3d(0, 0, 0)";
            motionSurface.style.opacity = "1";
            animationTimer = window.setTimeout(clearMotion, 200);
            return;
          }
          motionSurface.style.transition = "none";
          motionSurface.style.transform = `translate3d(${direction === 1 ? 44 : -44}px, 0, 0)`;
          motionSurface.style.opacity = "0.32";
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              motionSurface.style.transition =
                "transform 180ms cubic-bezier(0.22, 1, 0.36, 1), opacity 150ms ease-out";
              motionSurface.style.transform = "translate3d(0, 0, 0)";
              motionSurface.style.opacity = "1";
              animationTimer = window.setTimeout(clearMotion, 190);
            }),
          );
        },
        shouldNavigate ? 105 : 190,
      );
    };
    const cancel = () => {
      if (!gesture?.dragging) {
        gesture = undefined;
        return;
      }
      settle(gesture.startX);
    };
    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch) begin(touch.clientX, touch.clientY, event.target);
    };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch) move(touch.clientX, touch.clientY, () => event.preventDefault());
    };
    const onTouchEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      if (touch) settle(touch.clientX);
      else cancel();
    };
    const onMouseDown = (event: MouseEvent) => {
      if (event.button === 0) begin(event.clientX, event.clientY, event.target);
    };
    const onMouseMove = (event: MouseEvent) =>
      move(event.clientX, event.clientY, () => event.preventDefault());
    const onMouseUp = (event: MouseEvent) => settle(event.clientX);
    const suppressDraggedClick = (event: MouseEvent) => {
      if (performance.now() >= suppressClickUntil) return;
      event.preventDefault();
      event.stopPropagation();
    };

    gestureSurface.addEventListener("touchstart", onTouchStart, { passive: true });
    gestureSurface.addEventListener("touchmove", onTouchMove, { passive: false });
    gestureSurface.addEventListener("touchend", onTouchEnd);
    gestureSurface.addEventListener("touchcancel", cancel);
    gestureSurface.addEventListener("mousedown", onMouseDown);
    gestureSurface.addEventListener("click", suppressDraggedClick, true);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.clearTimeout(animationTimer);
      clearMotion();
      gestureSurface.removeEventListener("touchstart", onTouchStart);
      gestureSurface.removeEventListener("touchmove", onTouchMove);
      gestureSurface.removeEventListener("touchend", onTouchEnd);
      gestureSurface.removeEventListener("touchcancel", cancel);
      gestureSurface.removeEventListener("mousedown", onMouseDown);
      gestureSurface.removeEventListener("click", suppressDraggedClick, true);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return { gestureSurfaceRef, motionSurfaceRef };
}
