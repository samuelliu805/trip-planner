"use client";

import { useEffect, useRef } from "react";

type TouchPoint = { x: number; y: number };

export function useContainedPublicMatrix() {
  const matrixRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const matrix = matrixRef.current;
    if (!matrix) return;
    const scrollContainer = matrix;

    let previousTouch: TouchPoint | null = null;

    function rememberTouch(event: TouchEvent) {
      const touch = event.touches[0];
      previousTouch = touch ? { x: touch.clientX, y: touch.clientY } : null;
    }

    function handleTouchMove(event: TouchEvent) {
      const touch = event.touches[0];
      if (!touch || !previousTouch || event.touches.length !== 1) {
        rememberTouch(event);
        return;
      }

      const movementX = touch.clientX - previousTouch.x;
      const movementY = touch.clientY - previousTouch.y;
      previousTouch = { x: touch.clientX, y: touch.clientY };

      const edgeTolerance = 1;
      const maxScrollLeft = Math.max(0, scrollContainer.scrollWidth - scrollContainer.clientWidth);
      const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
      const horizontalBlocked =
        (movementX > 0 && scrollContainer.scrollLeft <= edgeTolerance) ||
        (movementX < 0 && maxScrollLeft - scrollContainer.scrollLeft <= edgeTolerance);
      const verticalBlocked =
        (movementY > 0 && scrollContainer.scrollTop <= edgeTolerance) ||
        (movementY < 0 && maxScrollTop - scrollContainer.scrollTop <= edgeTolerance);
      const horizontalIntent = Math.abs(movementX) >= Math.abs(movementY);
      const boundaryBlocked = horizontalIntent ? horizontalBlocked : verticalBlocked;

      if (boundaryBlocked && event.cancelable) event.preventDefault();
    }

    scrollContainer.addEventListener("touchstart", rememberTouch, { passive: true });
    scrollContainer.addEventListener("touchmove", handleTouchMove, { passive: false });
    scrollContainer.addEventListener("touchend", rememberTouch, { passive: true });
    scrollContainer.addEventListener("touchcancel", rememberTouch, { passive: true });

    return () => {
      scrollContainer.removeEventListener("touchstart", rememberTouch);
      scrollContainer.removeEventListener("touchmove", handleTouchMove);
      scrollContainer.removeEventListener("touchend", rememberTouch);
      scrollContainer.removeEventListener("touchcancel", rememberTouch);
    };
  }, []);

  return matrixRef;
}
