"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { captchaTokenFromFormData, missingCaptchaToken } from "@/features/auth/captcha";
import { passwordRecoverySchema, passwordResetRequestSchema } from "@/features/auth/schema";
import type { AuthActionState } from "@/features/auth/types";
import { siteUrlFromHeaders } from "@/features/sharing/site-url";
import { safeAuthErrorCode } from "@/lib/telemetry/errors";
import { telemetryOperationId } from "@/lib/telemetry/product";
import { captureServerProductEvent } from "@/lib/telemetry/product-server";
import {
  getAuthProvider,
  getBackendCapabilities,
  getPasswordRecoveryProvider,
} from "@/platform/composition/server";
import { PlatformOperationError } from "@/platform/contracts/errors";

export async function requestPasswordReset(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!getBackendCapabilities().passwordRecovery) {
    return { error: "Password recovery is not available." };
  }
  const parsed = passwordResetRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a valid email address." };
  }
  if (missingCaptchaToken(formData)) {
    return { error: "Complete the security check, then try again." };
  }
  const siteUrl = siteUrlFromHeaders(await headers());
  const redirectTo = new URL("/auth/verify", siteUrl);
  redirectTo.searchParams.set("auth_flow", "recovery");
  redirectTo.searchParams.set("auth_method", "email_link");
  try {
    await getPasswordRecoveryProvider().requestPasswordRecovery({
      captchaToken: captchaTokenFromFormData(formData),
      email: parsed.data.email,
      redirectTo: redirectTo.toString(),
    });
  } catch (error) {
    if (error instanceof PlatformOperationError) return { error: error.message };
    return { error: "Password recovery email could not be sent. Please try again." };
  }
  return {
    success: "If an account exists for that email, a password recovery link is on its way.",
  };
}

export async function verifyPasswordRecoveryToken(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!getBackendCapabilities().passwordRecovery) {
    return { error: "Password recovery is not available." };
  }
  const tokenHash = formData.get("token_hash");
  const operationId = telemetryOperationId(formData.get("operation_id"));
  if (
    typeof tokenHash !== "string" ||
    tokenHash.length < 16 ||
    tokenHash.length > 512 ||
    !/^[A-Za-z0-9_-]+$/.test(tokenHash)
  ) {
    return { error: "The recovery link is invalid or expired. Request a new one." };
  }
  try {
    const user = await getPasswordRecoveryProvider().verifyPasswordRecoveryToken(tokenHash);
    await captureServerProductEvent(
      "auth_succeeded",
      {
        auth_flow: "recovery",
        auth_method: "email_link",
        operation_id: operationId,
        surface: "auth_form",
      },
      { actorType: "authenticated", appUserId: user.id, route: "/auth/verify" },
    );
  } catch (error) {
    await captureServerProductEvent(
      "auth_failed",
      {
        auth_flow: "recovery",
        auth_method: "email_link",
        error_code: safeAuthErrorCode(error),
        operation_id: operationId,
        surface: "auth_form",
      },
      { actorType: "anonymous", route: "/auth/verify" },
    );
    return { error: "The recovery link is invalid or expired. Request a new one." };
  }
  redirect("/reset-password?recovery=1");
}

export async function completePasswordReset(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!getBackendCapabilities().passwordRecovery) {
    return { error: "Password recovery is not available." };
  }
  const parsed = passwordRecoverySchema.safeParse({
    confirmation: formData.get("password_confirmation"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }
  if (!(await getAuthProvider().getCurrentUser())) {
    return { error: "The recovery link is invalid or expired. Request a new one." };
  }
  try {
    await getPasswordRecoveryProvider().completePasswordRecovery({
      newPassword: parsed.data.password,
    });
  } catch {
    return { error: "Password could not be reset. Request a new recovery link and try again." };
  }
  try {
    await getAuthProvider().signOut();
  } catch {
    // The password reset is authoritative even if session cleanup is temporarily unavailable.
  }
  return { success: "Your password has been reset." };
}
