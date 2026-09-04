"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { PhoneOtpActionState } from "@/features/auth/types";
import { postLoginRefreshPath } from "@/features/auth/post-login";
import { isSameOriginRequest } from "@/features/sharing/site-url";
import { safeAuthErrorCode } from "@/lib/telemetry/errors";
import { telemetryAuthFlow, telemetryOperationId } from "@/lib/telemetry/product";
import { captureServerProductEvent } from "@/lib/telemetry/product-server";
import { getBackendCapabilities, getPhoneOtpAuthProvider } from "@/platform/composition/server";
import { PlatformOperationError } from "@/platform/contracts/errors";

const intentSchema = z.literal("session");

function metadata(formData: FormData) {
  return {
    authFlow: telemetryAuthFlow(formData.get("auth_flow")) ?? "login",
    operationId: telemetryOperationId(formData.get("operation_id")),
  } as const;
}

function safePhoneError(error: unknown) {
  if (error instanceof PlatformOperationError) {
    if (
      error.code === "captcha_required" ||
      error.code === "otp_expired" ||
      error.code === "otp_invalid" ||
      error.code === "rate_limited"
    )
      return error.message;
  }
  return "Phone sign-in could not be completed. Please try again.";
}

async function reportFailure(error: unknown, context: ReturnType<typeof metadata>) {
  await captureServerProductEvent(
    "auth_failed",
    {
      auth_flow: context.authFlow,
      auth_method: "sms",
      error_code: safeAuthErrorCode(error),
      operation_id: context.operationId,
      surface: "auth_form",
    },
    { actorType: "anonymous", route: context.authFlow === "signup" ? "/signup" : "/login" },
  );
}

export async function phoneOtpAuth(
  state: PhoneOtpActionState,
  formData: FormData,
): Promise<PhoneOtpActionState> {
  const context = metadata(formData);
  if (
    !getBackendCapabilities().publicAuthMethods.includes("phone_otp") ||
    !isSameOriginRequest(await headers())
  )
    return { error: "Phone sign-in is not available.", step: "phone" };

  const intent = intentSchema.safeParse(formData.get("intent"));
  if (!intent.success) return { error: "Check the form and try again.", step: state.step };
  const provider = getPhoneOtpAuthProvider();
  const tokens = z
    .object({
      accessToken: z.string().min(1).max(16_384),
      refreshToken: z.string().min(1).max(16_384),
    })
    .safeParse({
      accessToken: formData.get("access_token"),
      refreshToken: formData.get("refresh_token"),
    });
  if (!tokens.success)
    return { error: "Phone sign-in could not be completed. Please try again.", step: "otp" };
  try {
    const user = await provider.establishSession(tokens.data);
    await captureServerProductEvent(
      "auth_succeeded",
      {
        auth_flow: context.authFlow,
        auth_method: "sms",
        operation_id: context.operationId,
        surface: "auth_form",
      },
      { actorType: "authenticated", appUserId: user.id, route: "/login" },
    );
  } catch (error) {
    await reportFailure(error, context);
    return { error: safePhoneError(error), step: "otp" };
  }
  revalidatePath("/trips");
  redirect(postLoginRefreshPath);
}
