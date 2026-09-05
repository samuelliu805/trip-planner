import type { MouseEvent as ReactMouseEvent } from "react";

export const bookingAppViewportQuery = "(max-width: 1199px)";

type BookingAppDevice = {
  maxTouchPoints: number;
  platform: string;
  userAgent: string;
  viewportMatches: boolean;
};

type ManagedPopup = {
  close(): void;
  location: { replace(url: string): void };
  opener: unknown;
  setTimeout(handler: () => void, timeout: number): number;
};

type OpenWindow = (url: string, target: string) => ManagedPopup | null;

export function isBookingAppDevice(device: BookingAppDevice) {
  if (!device.viewportMatches) return false;
  return (
    /Android|iPad|iPhone|iPod|Kindle|Mobile|Silk|Tablet/i.test(device.userAgent) ||
    (device.platform === "MacIntel" && device.maxTouchPoints > 1)
  );
}

export function prepareCustomSchemeLaunch(
  anchor: Pick<HTMLAnchorElement, "href" | "target">,
  appUrl: string,
) {
  // Keep the launch on the trusted anchor activation; custom schemes do not commit a web document.
  anchor.href = appUrl;
  anchor.target = "_self";
}

export function openManagedAppWindow(openWindow: OpenWindow, webUrl: string) {
  const popup = openWindow("about:blank", "_blank");
  if (!popup) return false;
  popup.opener = null;
  // A committed web fallback replaces this document and cancels its timer. An app handoff leaves
  // the blank document uncommitted, so it can close itself when the browser becomes active again.
  popup.setTimeout(() => popup.close(), 1_500);
  popup.location.replace(webUrl);
  return true;
}

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
  if (
    !isBookingAppDevice({
      maxTouchPoints: navigator.maxTouchPoints,
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      viewportMatches: window.matchMedia(bookingAppViewportQuery).matches,
    })
  )
    return;

  const destination = new URL(appUrl);
  if (destination.protocol !== "http:" && destination.protocol !== "https:") {
    prepareCustomSchemeLaunch(event.currentTarget, appUrl);
    return;
  }

  if (openManagedAppWindow(window.open.bind(window), destination.href)) event.preventDefault();
}
