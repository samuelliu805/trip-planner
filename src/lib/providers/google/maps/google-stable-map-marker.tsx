"use client";

import { useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { createPortal } from "react-dom";
import { type ReactNode, useLayoutEffect, useMemo, useRef } from "react";

type Position = google.maps.LatLng | google.maps.LatLngLiteral;

/** React owns the content; OverlayView owns only its placement in the map pane. */
export function GoogleStableMapMarker({
  accessibleLabel,
  anchorLeft,
  anchorTop,
  children,
  onClick,
  position,
  title,
  zIndex,
}: {
  accessibleLabel: string;
  anchorLeft?: string;
  anchorTop?: string;
  children: ReactNode;
  onClick?: () => void;
  position: Position;
  title: string;
  zIndex: number;
}) {
  const map = useMap();
  const mapsLibrary = useMapsLibrary("maps");
  const content = useMemo(() => document.createElement("div"), []);
  const overlayRef = useRef<google.maps.OverlayView | null>(null);
  const positionRef = useRef(position);
  const clickRef = useRef(onClick);

  useLayoutEffect(() => {
    clickRef.current = onClick;
    positionRef.current = position;
    content.setAttribute("class", "google-map-marker");
    content.style.setProperty("position", "absolute");
    content.style.setProperty("display", "flex");
    content.style.setProperty("align-items", "flex-end");
    content.style.setProperty("justify-content", "center");
    content.style.setProperty("min-width", onClick ? "44px" : "0");
    content.style.setProperty("min-height", onClick ? "44px" : "0");
    content.style.setProperty(
      "transform",
      `translate(${anchorLeft ?? "-50%"}, ${anchorTop ?? "-100%"})`,
    );
    content.style.setProperty("z-index", String(zIndex));
    content.style.setProperty("pointer-events", onClick ? "auto" : "none");
    content.style.setProperty("cursor", onClick ? "pointer" : "default");
    content.setAttribute("title", title);
    content.setAttribute("tabindex", String(onClick ? 0 : -1));
    content.setAttribute("role", onClick ? "button" : "img");
    content.setAttribute("aria-label", accessibleLabel);
    overlayRef.current?.draw();
  }, [accessibleLabel, anchorLeft, anchorTop, content, onClick, position, title, zIndex]);

  useLayoutEffect(() => {
    if (!map || !mapsLibrary) return;
    const overlay = new mapsLibrary.OverlayView();
    const attach = () => overlay.getPanes()?.overlayMouseTarget?.appendChild(content);
    overlay.onAdd = attach;
    overlay.draw = () => {
      if (overlayRef.current !== overlay) return;
      const pixel = overlay
        .getProjection()
        ?.fromLatLngToDivPixel(new google.maps.LatLng(positionRef.current));
      if (!pixel) return;
      if (!content.isConnected) attach();
      content.style.setProperty("left", `${pixel.x}px`);
      content.style.setProperty("top", `${pixel.y}px`);
    };
    overlay.onRemove = () => {
      // SDK callbacks can arrive after a reused map has acquired a new overlay.
      if (!overlayRef.current || overlayRef.current === overlay) content.remove();
    };
    const click = (event: Event) => {
      if (!clickRef.current) return;
      event.stopPropagation();
      clickRef.current();
    };
    const keydown = (event: KeyboardEvent) => {
      if (!clickRef.current || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      click(event);
    };
    content.addEventListener("click", click);
    content.addEventListener("keydown", keydown);
    overlayRef.current = overlay;
    overlay.setMap(map);
    return () => {
      content.removeEventListener("click", click);
      content.removeEventListener("keydown", keydown);
      overlay.setMap(null);
      if (overlayRef.current === overlay) overlayRef.current = null;
    };
  }, [content, map, mapsLibrary]);

  return createPortal(<div>{children}</div>, content);
}
