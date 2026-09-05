import type { MouseEvent as ReactMouseEvent } from "react";

export const bookingAppViewportQuery = "(max-width: 1199px)";

export function openAppDeepLink(event: ReactMouseEvent<HTMLAnchorElement>, appUrl: string) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  if (!window.matchMedia(bookingAppViewportQuery).matches) return;

  event.preventDefault();
  window.open(appUrl, "_blank", "noopener,noreferrer");
}
