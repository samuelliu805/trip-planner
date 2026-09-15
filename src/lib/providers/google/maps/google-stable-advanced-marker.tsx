"use client";

import { AdvancedMarkerContext, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { createPortal } from "react-dom";
import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";

type Position = google.maps.LatLng | google.maps.LatLngLiteral;

export function GoogleStableAdvancedMarker({
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
  const markerLibrary = useMapsLibrary("marker");
  const content = useMemo(() => document.createElement("div"), []);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const clickRef = useRef(onClick);
  const [marker, setMarker] = useState<google.maps.marker.AdvancedMarkerElement | null>(null);

  useLayoutEffect(() => {
    clickRef.current = onClick;
  }, [onClick]);

  useLayoutEffect(() => {
    if (!map || !markerLibrary) return;

    const nextMarker = new markerLibrary.AdvancedMarkerElement({
      content,
      gmpClickable: Boolean(clickRef.current),
      map,
      position,
      title,
      zIndex,
    });
    const handleClick = () => clickRef.current?.();

    nextMarker.setAttribute("aria-label", accessibleLabel);
    if (anchorLeft !== undefined) nextMarker.anchorLeft = anchorLeft;
    if (anchorTop !== undefined) nextMarker.anchorTop = anchorTop;
    nextMarker.addEventListener("gmp-click", handleClick);
    markerRef.current = nextMarker;
    setMarker(nextMarker);

    return () => {
      nextMarker.removeEventListener("gmp-click", handleClick);
      // A layout cleanup runs before React removes the portalled marker content.
      // Google Maps otherwise reads detached content while clearing `map` and can crash.
      nextMarker.map = null;
      markerRef.current = null;
      setMarker((current) => (current === nextMarker ? null : current));
    };
    // The remaining values are updated by the layout effect below without recreating the marker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, map, markerLibrary]);

  useLayoutEffect(() => {
    const current = markerRef.current;
    if (!current) return;

    current.position = position;
    current.title = title;
    current.zIndex = zIndex;
    current.gmpClickable = Boolean(onClick);
    current.setAttribute("aria-label", accessibleLabel);
    current.anchorLeft = anchorLeft;
    current.anchorTop = anchorTop;
  }, [accessibleLabel, anchorLeft, anchorTop, onClick, position, title, zIndex]);

  const context = useMemo(() => (marker ? { marker } : null), [marker]);

  return createPortal(
    <AdvancedMarkerContext.Provider value={context}>
      <div>{marker ? children : null}</div>
    </AdvancedMarkerContext.Provider>,
    content,
  );
}
