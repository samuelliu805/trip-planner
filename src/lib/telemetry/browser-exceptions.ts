import { normalizeTelemetryRoute, sanitizedCurrentUrl } from "./routes.ts";

export type BrowserExceptionCapture = (error: unknown) => void;

export function browserExceptionContext(location: Pick<Location, "href" | "pathname">) {
  const route = normalizeTelemetryRoute(location.pathname);
  return {
    $current_url: sanitizedCurrentUrl(location.href),
    $pathname: route,
    error_code: "unexpected_error",
    route,
    runtime: "browser",
  } as const;
}

function unhandledBrowserError(event: ErrorEvent): unknown {
  return event.error ?? new Error("Unhandled browser exception");
}

function unhandledRejectionError(event: PromiseRejectionEvent): unknown {
  return event.reason instanceof Error ? event.reason : new Error("Unhandled promise rejection");
}

/**
 * Owns the document-level exception subscriptions for every route. Keeping this above the
 * provider instances prevents owner and Public Share clients from installing overlapping SDK
 * handlers during client navigation.
 */
export function installBrowserExceptionCapture(
  target: Window,
  capture: BrowserExceptionCapture,
): () => void {
  const safelyCapture = (error: unknown) => {
    try {
      capture(error);
    } catch {
      // Exception delivery cannot become another application exception.
    }
  };
  const onError = (event: ErrorEvent) => safelyCapture(unhandledBrowserError(event));
  const onUnhandledRejection = (event: PromiseRejectionEvent) =>
    safelyCapture(unhandledRejectionError(event));

  let errorInstalled = false;
  try {
    target.addEventListener("error", onError);
    errorInstalled = true;
    target.addEventListener("unhandledrejection", onUnhandledRejection);
  } catch {
    if (errorInstalled) {
      try {
        target.removeEventListener("error", onError);
      } catch {
        // A partially installed telemetry listener must not affect the page.
      }
    }
    return () => undefined;
  }

  return () => {
    try {
      target.removeEventListener("error", onError);
      target.removeEventListener("unhandledrejection", onUnhandledRejection);
    } catch {
      // Telemetry cleanup must never affect route teardown.
    }
  };
}
