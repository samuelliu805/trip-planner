"use client";

import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { useLayoutEffect, useRef } from "react";

/** The SDK owns only this container's contents, never another React component's nodes. */
export function GoogleStablePin({
  background,
  borderColor,
  glyph,
  glyphColor,
  scale,
}: Pick<
  google.maps.marker.PinElementOptions,
  "background" | "borderColor" | "glyphColor" | "scale"
> & { glyph?: string }) {
  const library = useMapsLibrary("marker");
  const container = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const node = container.current;
    if (!node || !library) return;
    const [major, minor] = google.maps.version.split(".").map(Number);
    const modern = major > 3 || (major === 3 && minor >= 62);
    const pin = new library.PinElement({
      background,
      borderColor,
      glyphColor,
      scale,
      ...(modern ? { glyphText: glyph } : { glyph }),
    });
    // Older SDK versions expose a separate element despite the current HTMLElement typings.
    const element = pin instanceof Node ? pin : (pin as google.maps.marker.PinElement).element;
    node.appendChild(element);
    return () => element.remove();
  }, [background, borderColor, glyph, glyphColor, library, scale]);
  return <span ref={container} />;
}
