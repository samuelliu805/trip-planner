import type { MouseEvent as ReactMouseEvent } from "react";

const fallbackDelayMs = 1_800;

export function openAppDeepLink(
  event: ReactMouseEvent<HTMLAnchorElement>,
  appUrl: string,
  fallbackUrl: string,
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

  event.preventDefault();
  let timer = 0;
  const cleanup = () => {
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("pagehide", cleanup);
  };
  const handleVisibilityChange = () => {
    if (document.hidden) cleanup();
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pagehide", cleanup);
  timer = window.setTimeout(() => {
    cleanup();
    if (!document.hidden) window.location.assign(fallbackUrl);
  }, fallbackDelayMs);
  window.location.assign(appUrl);
}
