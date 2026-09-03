"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { maskMainlandPhone, normalizeMainlandPhone } from "@/features/auth/phone";
import type { PhoneOtpActionState } from "@/features/auth/types";
import { isSameOriginRequest } from "@/features/sharing/site-url";
import { safeAuthErrorCode } from "@/lib/telemetry/errors";
import { telemetryAuthFlow, telemetryOperationId } from "@/lib/telemetry/product";
import { captureServerProductEvent } from "@/lib/telemetry/product-server";
import { getBackendCapabilities, getPhoneOtpAuthProvider } from "@/platform/composition/server";
import { PlatformOperationError } from "@/platform/contracts/errors";

const intentSchema = z.enum(["request", "reset", "verify"]);
const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code.");

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
  if (intent.data === "reset") {
    await provider.clearChallenge();
    return { step: "phone" };
  }

  if (intent.data === "request") {
    const phone = normalizeMainlandPhone(formData.get("phone"));
    if (!phone) return { error: "Enter a valid mainland China mobile number.", step: state.step };
    try {
      const result = await provider.requestOtp({ challengeToken: state.challengeToken, phone });
      return {
        challengeToken: result.challengeToken,
        maskedPhone: maskMainlandPhone(phone),
        resendAt: result.resendAt,
        step: "otp",
      };
    } catch (error) {
      await reportFailure(error, context);
      return { ...state, error: safePhoneError(error) };
    }
  }

  const code = codeSchema.safeParse(formData.get("code"));
  if (!code.success) return { ...state, error: code.error.issues[0]?.message };
  try {
    const user = await provider.verifyOtp({
      challengeToken: state.challengeToken,
      code: code.data,
    });
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
    return error instanceof PlatformOperationError && error.code === "otp_expired"
      ? { error: safePhoneError(error), step: "phone" }
      : { ...state, error: safePhoneError(error), step: "otp" };
  }
  revalidatePath("/trips");
  redirect("/trips");
}
