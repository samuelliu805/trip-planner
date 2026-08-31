import { NextResponse, type NextRequest } from "next/server";

import { siteUrlFromHeaders } from "@/features/sharing/site-url";
import { safeAuthErrorCode } from "@/lib/telemetry/errors";
import {
  telemetryAuthFlow,
  telemetryAuthMethod,
  telemetryOperationId,
} from "@/lib/telemetry/product";
import { captureServerProductEvent } from "@/lib/telemetry/product-server";
import { getAuthorizationCodeExchangeProvider } from "@/platform/composition/server";

export async function GET(request: NextRequest) {
  const siteUrl = siteUrlFromHeaders(request.headers, request.nextUrl.origin);
  const code = request.nextUrl.searchParams.get("code");
  const authFlow =
    telemetryAuthFlow(request.nextUrl.searchParams.get("auth_flow")) ?? "confirmation";
  const authMethod =
    telemetryAuthMethod(request.nextUrl.searchParams.get("auth_method")) ??
    (request.nextUrl.searchParams.has("error") ? "google" : "email_link");
  const operationId = telemetryOperationId(request.nextUrl.searchParams.get("operation_id"));
  if (code) {
    try {
      const user = await getAuthorizationCodeExchangeProvider().exchangeAuthorizationCode(code);
      await captureServerProductEvent(
        "auth_succeeded",
        {
          auth_flow: authFlow,
          auth_method: authMethod,
          operation_id: operationId,
          surface: "auth_form",
        },
        {
          actorType: "authenticated",
          route: "/auth/callback",
          appUserId: user.id,
        },
      );
      return NextResponse.redirect(new URL("/trips", siteUrl));
    } catch (error) {
      await captureServerProductEvent(
        "auth_failed",
        {
          auth_flow: authFlow,
          auth_method: authMethod,
          error_code: safeAuthErrorCode(error),
          operation_id: operationId,
          surface: "auth_form",
        },
        { actorType: "anonymous", route: "/auth/callback" },
      );
    }
  } else if (request.nextUrl.searchParams.has("error") || operationId) {
    await captureServerProductEvent(
      "auth_failed",
      {
        auth_flow: authFlow,
        auth_method: authMethod,
        error_code: "authentication_failed",
        operation_id: operationId,
        surface: "auth_form",
      },
      { actorType: "anonymous", route: "/auth/callback" },
    );
  }

  const source = authMethod === "google" ? "google" : "confirmation";
  return NextResponse.redirect(new URL(`/login?error=${source}`, siteUrl));
}
