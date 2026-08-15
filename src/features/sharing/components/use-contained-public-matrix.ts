"use client";

import { useEffect, useRef } from "react";

type TouchPoint = { x: number; y: number };

const frozenLayerSelector = ".matrix-grid-header, .matrix-date-column, .matrix-day-column";

function isFrozenLayer(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(frozenLayerSelector));
}

function clampedScrollPosition(current: number, movement: number, maximum: number) {
  return Math.min(maximum, Math.max(0, current - movement));
}

export function useContainedPublicMatrix() {
  const matrixRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const matrix = matrixRef.current;
    if (!matrix) return;
    const scrollContainer = matrix;

    let previousTouch: TouchPoint | null = null;
    let draggingFrozenLayer = false;

    function rememberTouch(event: TouchEvent) {
      const touch = event.touches[0];
      previousTouch = touch ? { x: touch.clientX, y: touch.clientY } : null;
    }

    function handleTouchStart(event: TouchEvent) {
      draggingFrozenLayer = event.touches.length === 1 && isFrozenLayer(event.target);
      rememberTouch(event);
    }

    function finishTouch() {
      draggingFrozenLayer = false;
      previousTouch = null;
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

      if (draggingFrozenLayer) {
        if (event.cancelable) event.preventDefault();
        scrollContainer.scrollLeft = clampedScrollPosition(
          scrollContainer.scrollLeft,
          movementX,
          maxScrollLeft,
        );
        scrollContainer.scrollTop = clampedScrollPosition(
          scrollContainer.scrollTop,
          movementY,
          maxScrollTop,
        );
        return;
      }

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

    scrollContainer.addEventListener("touchstart", handleTouchStart, { passive: true });
    scrollContainer.addEventListener("touchmove", handleTouchMove, { passive: false });
    scrollContainer.addEventListener("touchend", finishTouch, { passive: true });
    scrollContainer.addEventListener("touchcancel", finishTouch, { passive: true });

    return () => {
      scrollContainer.removeEventListener("touchstart", handleTouchStart);
      scrollContainer.removeEventListener("touchmove", handleTouchMove);
      scrollContainer.removeEventListener("touchend", finishTouch);
      scrollContainer.removeEventListener("touchcancel", finishTouch);
    };
  }, []);

  return matrixRef;
}
