"use client";

import { useEffect, useRef } from "react";

type DragGesture = {
  dragging: boolean;
  offset: number;
  scrollTarget: HTMLElement | null;
  startX: number;
  startedAt: number;
  startY: number;
};

function verticalScroller(target: EventTarget | null, surface: HTMLElement) {
  let element = target instanceof Element ? target : null;
  while (element && element !== surface) {
    if (element instanceof HTMLElement) {
      const { overflowY } = getComputedStyle(element);
      if (
        (overflowY === "auto" || overflowY === "scroll") &&
        element.scrollHeight > element.clientHeight + 1
      )
        return element;
    }
    element = element.parentElement;
  }
  return null;
}

function surfaceOverlay(surface: HTMLElement) {
  const sibling = surface.previousElementSibling;
  return sibling instanceof HTMLElement &&
    sibling.matches("[data-dialog-overlay], [data-sheet-overlay]")
    ? sibling
    : null;
}

/**
 * Gives a bottom Sheet the direct-manipulation behavior of an iOS sheet: drag from anywhere,
 * hand a downward scroll to the sheet only when its content is already at the top, follow the
 * finger, then dismiss on distance/velocity or spring back into place.
 */
export function usePullUpPanelDrag(onClose: () => void) {
  const controllerRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const controller = controllerRef.current;
    const surface = controller?.closest<HTMLElement>(".mobile-pull-up-panel");
    if (!controller || !surface) return;

    const overlay = surfaceOverlay(surface);
    let gesture: DragGesture | undefined;
    let settleTimer = 0;
    let suppressClickUntil = 0;

    const clearInlineMotion = () => {
      surface.style.removeProperty("transform");
      surface.style.removeProperty("transition");
      surface.style.removeProperty("will-change");
      surface.removeAttribute("data-pull-up-dragging");
      overlay?.style.removeProperty("opacity");
      overlay?.style.removeProperty("transition");
      overlay?.style.removeProperty("will-change");
    };

    const begin = (clientX: number, clientY: number, target: EventTarget | null) => {
      if (!controller.getClientRects().length) return;
      window.clearTimeout(settleTimer);
      clearInlineMotion();
      gesture = {
        dragging: false,
        offset: 0,
        scrollTarget: verticalScroller(target, surface),
        startX: clientX,
        startedAt: performance.now(),
        startY: clientY,
      };
    };

    const move = (clientX: number, clientY: number, preventDefault: () => void) => {
      const current = gesture;
      if (!current) return;

      if (current.scrollTarget && current.scrollTarget.scrollTop > 0) {
        current.startX = clientX;
        current.startY = clientY;
        current.startedAt = performance.now();
        return;
      }

      const distance = clientY - current.startY;
      const horizontalDistance = Math.abs(clientX - current.startX);
      if (!current.dragging) {
        if (distance <= 0) return;
        if (horizontalDistance > distance) {
          gesture = undefined;
          return;
        }
        preventDefault();
        if (distance <= 6) return;
        current.dragging = true;
        surface.setAttribute("data-pull-up-dragging", "");
        surface.style.transition = "none";
        surface.style.willChange = "transform";
        if (overlay) {
          overlay.style.transition = "none";
          overlay.style.willChange = "opacity";
        }
      }

      preventDefault();
      current.offset = Math.max(0, distance);
      surface.style.transform = `translate3d(0, ${current.offset}px, 0)`;
      if (overlay) {
        const fade = Math.max(0, 1 - current.offset / Math.max(1, surface.clientHeight * 0.85));
        overlay.style.opacity = String(fade);
      }
    };

    const settle = (clientY: number) => {
      const current = gesture;
      gesture = undefined;
      if (!current?.dragging) return;

      suppressClickUntil = performance.now() + 350;
      const elapsed = Math.max(1, performance.now() - current.startedAt);
      const distance = Math.max(current.offset, clientY - current.startY);
      const velocity = distance / elapsed;
      const close =
        distance >= Math.min(160, surface.clientHeight * 0.22) ||
        (distance >= 48 && velocity >= 0.55);

      surface.style.transition = close
        ? "transform 180ms cubic-bezier(0.32, 0.72, 0, 1)"
        : "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)";
      surface.style.transform = close
        ? `translate3d(0, ${surface.clientHeight}px, 0)`
        : "translate3d(0, 0, 0)";
      if (overlay) {
        overlay.style.transition = close ? "opacity 180ms ease-out" : "opacity 240ms ease-out";
        overlay.style.opacity = close ? "0" : "1";
      }

      settleTimer = window.setTimeout(
        () => {
          if (close) onCloseRef.current();
          else clearInlineMotion();
        },
        close ? 160 : 320,
      );
    };

    const cancel = () => {
      if (gesture?.dragging) {
        gesture.offset = 0;
        settle(gesture.startY);
      } else gesture = undefined;
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
      if (touch) settle(touch.clientY);
      else cancel();
    };
    const onMouseDown = (event: MouseEvent) => {
      if (event.button === 0) begin(event.clientX, event.clientY, event.target);
    };
    const onMouseMove = (event: MouseEvent) =>
      move(event.clientX, event.clientY, () => event.preventDefault());
    const onMouseUp = (event: MouseEvent) => settle(event.clientY);
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
      window.clearTimeout(settleTimer);
      clearInlineMotion();
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

  return controllerRef;
}
