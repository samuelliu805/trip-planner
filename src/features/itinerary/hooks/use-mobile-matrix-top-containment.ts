"use client";

import { useEffect, type RefObject } from "react";

const mobileMatrixQuery = "(max-width: 639px)";

type TouchPoint = { x: number; y: number };

/** Prevents iOS pull-down rubber-banding only when the mobile owner Matrix is already at the top. */
export function useMobileMatrixTopContainment<T extends HTMLElement>(
  matrixRef: RefObject<T | null>,
) {
  useEffect(() => {
    const matrixNode = matrixRef.current;
    if (!matrixNode) return;
    const matrix: T = matrixNode;
    const mobile = window.matchMedia(mobileMatrixQuery);
    let previousTouch: TouchPoint | null = null;
    let listening = false;

    function rememberTouch(event: TouchEvent) {
      const touch = event.touches[0];
      previousTouch = touch ? { x: touch.clientX, y: touch.clientY } : null;
    }

    function containTopPull(event: TouchEvent) {
      const touch = event.touches[0];
      if (!touch || !previousTouch || event.touches.length !== 1) {
        rememberTouch(event);
        return;
      }

      const movementX = touch.clientX - previousTouch.x;
      const movementY = touch.clientY - previousTouch.y;
      previousTouch = { x: touch.clientX, y: touch.clientY };
      const pullingDown = movementY > 0 && Math.abs(movementY) > Math.abs(movementX);

      if (pullingDown && matrix.scrollTop <= 1 && event.cancelable) event.preventDefault();
    }

    function clearTouch() {
      previousTouch = null;
    }

    function startListening() {
      if (listening) return;
      listening = true;
      matrix.addEventListener("touchstart", rememberTouch, { passive: true });
      matrix.addEventListener("touchmove", containTopPull, { passive: false });
      matrix.addEventListener("touchend", clearTouch, { passive: true });
      matrix.addEventListener("touchcancel", clearTouch, { passive: true });
    }

    function stopListening() {
      if (!listening) return;
      listening = false;
      clearTouch();
      matrix.removeEventListener("touchstart", rememberTouch);
      matrix.removeEventListener("touchmove", containTopPull);
      matrix.removeEventListener("touchend", clearTouch);
      matrix.removeEventListener("touchcancel", clearTouch);
    }

    function syncMobileContainment() {
      if (mobile.matches) startListening();
      else stopListening();
    }

    syncMobileContainment();
    mobile.addEventListener("change", syncMobileContainment);

    return () => {
      mobile.removeEventListener("change", syncMobileContainment);
      stopListening();
    };
  }, [matrixRef]);
}
