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
  const surfaceRef = useRef<HTMLDivElement>(null);
  const onNavigateRef = useRef(onNavigate);

  useEffect(() => {
    onNavigateRef.current = onNavigate;
  }, [onNavigate]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    let gesture: Gesture | undefined;
    let animationTimer = 0;
    let suppressClickUntil = 0;

    const clearMotion = () => {
      surface.style.removeProperty("opacity");
      surface.style.removeProperty("transform");
      surface.style.removeProperty("transition");
      surface.style.removeProperty("user-select");
      surface.style.removeProperty("will-change");
      surface.removeAttribute("data-step-dragging");
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
        surface.setAttribute("data-step-dragging", "");
        surface.style.transition = "none";
        surface.style.userSelect = "none";
        surface.style.willChange = "transform, opacity";
      }
      preventDefault();
      const offset = Math.max(-96, Math.min(96, x * 0.72));
      surface.style.transform = `translate3d(${offset}px, 0, 0)`;
      surface.style.opacity = String(1 - Math.min(0.18, Math.abs(offset) / 520));
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
        Math.abs(distance) >= 64 || (Math.abs(distance) >= 28 && velocity > 0.5);

      surface.style.transition = shouldNavigate
        ? "transform 150ms cubic-bezier(0.32, 0.72, 0, 1), opacity 150ms ease-out"
        : "transform 280ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease-out";
      surface.style.transform = shouldNavigate
        ? `translate3d(${direction === 1 ? -96 : 96}px, 0, 0)`
        : "translate3d(0, 0, 0)";
      surface.style.opacity = shouldNavigate ? "0.18" : "1";

      animationTimer = window.setTimeout(
        () => {
          if (!shouldNavigate || !onNavigateRef.current(direction)) {
            surface.style.transition =
              "transform 280ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease-out";
            surface.style.transform = "translate3d(0, 0, 0)";
            surface.style.opacity = "1";
            animationTimer = window.setTimeout(clearMotion, 280);
            return;
          }
          surface.style.transition = "none";
          surface.style.transform = `translate3d(${direction === 1 ? 56 : -56}px, 0, 0)`;
          surface.style.opacity = "0.25";
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              surface.style.transition =
                "transform 240ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease-out";
              surface.style.transform = "translate3d(0, 0, 0)";
              surface.style.opacity = "1";
              animationTimer = window.setTimeout(clearMotion, 250);
            }),
          );
        },
        shouldNavigate ? 145 : 280,
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

    surface.addEventListener("touchstart", onTouchStart, { passive: true });
    surface.addEventListener("touchmove", onTouchMove, { passive: false });
    surface.addEventListener("touchend", onTouchEnd);
    surface.addEventListener("touchcancel", cancel);
    surface.addEventListener("mousedown", onMouseDown);
    surface.addEventListener("click", suppressDraggedClick, true);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.clearTimeout(animationTimer);
      clearMotion();
      surface.removeEventListener("touchstart", onTouchStart);
      surface.removeEventListener("touchmove", onTouchMove);
      surface.removeEventListener("touchend", onTouchEnd);
      surface.removeEventListener("touchcancel", cancel);
      surface.removeEventListener("mousedown", onMouseDown);
      surface.removeEventListener("click", suppressDraggedClick, true);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return surfaceRef;
}
