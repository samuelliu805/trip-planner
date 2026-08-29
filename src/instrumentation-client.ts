import {
  browserExceptionContext,
  installBrowserExceptionCapture,
} from "@/lib/telemetry/browser-exceptions";
import { analyticsBoundaryForRoute, initializeBrowserTelemetry } from "@/lib/telemetry/client";
import { browserTelemetryConfig } from "@/lib/telemetry/config";

initializeBrowserTelemetry();
installBrowserExceptionCapture(window, (error) => {
  const context = browserExceptionContext(window.location);
  initializeBrowserTelemetry(browserTelemetryConfig, window.location.pathname);
  analyticsBoundaryForRoute(context.route).captureException(error, context);
});
