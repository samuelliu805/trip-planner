import type { MouseEvent as ReactMouseEvent } from "react";

export const bookingAppViewportQuery = "(max-width: 1199px)";

type BookingAppDevice = {
  maxTouchPoints: number;
  platform: string;
  userAgent: string;
  viewportMatches: boolean;
};

export function isBookingAppDevice(device: BookingAppDevice) {
  if (!device.viewportMatches) return false;
  return (
    /Android|iPad|iPhone|iPod|Kindle|Mobile|Silk|Tablet/i.test(device.userAgent) ||
    (device.platform === "MacIntel" && device.maxTouchPoints > 1)
  );
}

export function customSchemeFallbackDelay() {
  return 1_200;
}

function launchCustomScheme(appUrl: string, webUrl: string) {
  let completed = false;
  const cleanup = () => {
    if (completed) return;
    completed = true;
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", cleanup);
  };
  const onVisibilityChange = () => {
    if (document.hidden) cleanup();
  };
  const timer = window.setTimeout(() => {
    cleanup();
    window.location.assign(webUrl);
  }, customSchemeFallbackDelay());
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", cleanup, { once: true });
  try {
    window.location.assign(appUrl);
  } catch {
    cleanup();
    window.location.assign(webUrl);
  }
}

export function openAppDeepLink(
  event: ReactMouseEvent<HTMLAnchorElement>,
  appUrl: string,
  webUrl: string,
) {
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
  if (destination.protocol === "http:" || destination.protocol === "https:") return;
  event.preventDefault();
  launchCustomScheme(appUrl, webUrl);
}
