"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";

import type { AuthActionState } from "@/features/auth/types";
import { normalizeMainlandPhone } from "@/features/auth/phone";
import { siteUrlFromHeaders } from "@/features/sharing/site-url";
import { safeAuthErrorCode } from "@/lib/telemetry/errors";
import {
  telemetryAuthFlow,
  telemetryOperationId,
  telemetrySurface,
  reportSuccessfulSignOut,
} from "@/lib/telemetry/product";
import { captureServerProductEvent } from "@/lib/telemetry/product-server";
import {
  getAuthProvider,
  getBackendCapabilities,
  getPublicSelfRegistrationProvider,
  getRedirectOAuthProvider,
} from "@/platform/composition/server";
import { PlatformOperationError } from "@/platform/contracts/errors";

const emailCredentialSchema = z.object({
  credential: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

const usernameCredentialSchema = z.object({
  credential: z.string().trim().min(1, "Enter your username.").max(128, "Username is too long."),
  password: z.string().min(1, "Enter your password."),
});

const phoneCredentialSchema = z.object({
  credential: z.string().trim(),
  password: z.string().min(1, "Enter your password."),
});

function loginError(error: unknown, identifier: "email" | "phone" | "username") {
  if (error instanceof PlatformOperationError) {
    if (error.code === "captcha_required") return error.message;
    if (error.code === "invalid_credentials") {
      if (identifier === "phone") return "Phone number or password is incorrect.";
      if (identifier === "email") return "Email or password is incorrect.";
      return "Username or password is incorrect.";
    }
  }
  return "Sign-in could not be completed. Please try again.";
}

function authMetadata(formData: FormData, fallbackFlow: "login" | "signup") {
  return {
    authFlow: telemetryAuthFlow(formData.get("auth_flow")) ?? fallbackFlow,
    operationId: telemetryOperationId(formData.get("operation_id")),
  };
}

export async function login(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const metadata = authMetadata(formData, "login");
  const capabilities = getBackendCapabilities();
  const requestedKind = formData.get("credential_kind");
  const passwordIdentifier =
    requestedKind === "phone" && capabilities.publicAuthMethods.includes("phone_password")
      ? "phone"
      : capabilities.publicAuthMethods.includes("email_password")
        ? "email"
        : capabilities.protectedAuthMethods.includes("username_password")
          ? "username"
          : null;
  if (!passwordIdentifier) return { error: "This sign-in method is not available." };
  const parsed = (
    passwordIdentifier === "username"
      ? usernameCredentialSchema
      : passwordIdentifier === "phone"
        ? phoneCredentialSchema
        : emailCredentialSchema
  ).safeParse({
    credential: formData.get("credential"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    await captureServerProductEvent(
      "auth_failed",
      {
        auth_flow: metadata.authFlow,
        auth_method: "password",
        error_code: "invalid_input",
        operation_id: metadata.operationId,
        surface: "auth_form",
      },
      { actorType: "anonymous", route: "/login" },
    );
    return { error: parsed.error.issues[0]?.message ?? "Invalid credentials." };
  }

  const phone =
    passwordIdentifier === "phone" ? normalizeMainlandPhone(parsed.data.credential) : null;
  if (passwordIdentifier === "phone" && !phone) {
    return { error: "Enter a valid mainland China mobile number." };
  }

  try {
    const user = await getAuthProvider().signIn(
      passwordIdentifier === "username"
        ? {
            method: "username_password",
            password: parsed.data.password,
            username: parsed.data.credential,
          }
        : passwordIdentifier === "phone"
          ? {
              method: "phone_password",
              password: parsed.data.password,
              phone: phone!,
            }
          : {
              email: parsed.data.credential,
              method: "email_password",
              password: parsed.data.password,
            },
    );
    await captureServerProductEvent(
      "auth_succeeded",
      {
        auth_flow: metadata.authFlow,
        auth_method: "password",
        operation_id: metadata.operationId,
        surface: "auth_form",
      },
      { actorType: "authenticated", appUserId: user.id, route: "/login" },
    );
  } catch (error) {
    await captureServerProductEvent(
      "auth_failed",
      {
        auth_flow: metadata.authFlow,
        auth_method: "password",
        error_code: safeAuthErrorCode(error),
        operation_id: metadata.operationId,
        surface: "auth_form",
      },
      { actorType: "anonymous", route: "/login" },
    );
    return { error: loginError(error, passwordIdentifier) };
  }
  revalidatePath("/trips");
  redirect("/trips");
}

export async function continueWithGoogle(formData: FormData) {
  const metadata = authMetadata(formData, "login");
  if (!getBackendCapabilities().publicAuthMethods.includes("google_oauth")) {
    redirect("/login");
  }
  const siteUrl = siteUrlFromHeaders(await headers());
  const callbackUrl = new URL("/auth/callback", siteUrl);
  callbackUrl.searchParams.set("auth_flow", metadata.authFlow);
  callbackUrl.searchParams.set("auth_method", "google");
  if (metadata.operationId) callbackUrl.searchParams.set("operation_id", metadata.operationId);
  let redirectUrl: string;
  try {
    ({ redirectUrl } = await getRedirectOAuthProvider().startOAuthSignIn({
      authorizationParameters: { prompt: "select_account" },
      provider: "google",
      redirectTo: callbackUrl.toString(),
    }));
  } catch (error) {
    await captureServerProductEvent(
      "auth_failed",
      {
        auth_flow: metadata.authFlow,
        auth_method: "google",
        error_code: safeAuthErrorCode(error),
        operation_id: metadata.operationId,
        surface: "auth_form",
      },
      { actorType: "anonymous", route: metadata.authFlow === "signup" ? "/signup" : "/login" },
    );
    redirect("/login?error=google");
  }
  redirect(redirectUrl);
}

export async function signup(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const metadata = authMetadata(formData, "signup");
  if (!getBackendCapabilities().publicAuthMethods.includes("email_password")) {
    return { error: "Account creation is managed by your organization." };
  }
  const parsed = emailCredentialSchema
    .extend({ password: z.string().min(8, "Password must be at least 8 characters.") })
    .safeParse({ credential: formData.get("credential"), password: formData.get("password") });
  if (!parsed.success) {
    await captureServerProductEvent(
      "auth_failed",
      {
        auth_flow: metadata.authFlow,
        auth_method: "password",
        error_code: "invalid_input",
        operation_id: metadata.operationId,
        surface: "auth_form",
      },
      { actorType: "anonymous", route: "/signup" },
    );
    return { error: parsed.error.issues[0]?.message ?? "Invalid account details." };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const confirmationUrl = siteUrl ? new URL("/auth/callback", siteUrl) : undefined;
  confirmationUrl?.searchParams.set("auth_flow", "confirmation");
  confirmationUrl?.searchParams.set("auth_method", "email_link");
  if (metadata.operationId) confirmationUrl?.searchParams.set("operation_id", metadata.operationId);
  let sessionCreated = false;
  try {
    const result = await getPublicSelfRegistrationProvider().signUp({
      email: parsed.data.credential,
      method: "email_password",
      password: parsed.data.password,
      verificationRedirectTo: confirmationUrl?.toString(),
    });
    await captureServerProductEvent(
      "auth_succeeded",
      {
        auth_flow: metadata.authFlow,
        auth_method: "password",
        operation_id: metadata.operationId,
        surface: "auth_form",
      },
      {
        actorType: result.user ? "authenticated" : "anonymous",
        appUserId: result.user?.id,
        route: "/signup",
      },
    );
    sessionCreated = result.sessionCreated;
  } catch (error) {
    await captureServerProductEvent(
      "auth_failed",
      {
        auth_flow: metadata.authFlow,
        auth_method: "password",
        error_code: safeAuthErrorCode(error),
        operation_id: metadata.operationId,
        surface: "auth_form",
      },
      { actorType: "anonymous", route: "/signup" },
    );
    return { error: error instanceof Error ? error.message : "Account creation failed." };
  }
  if (sessionCreated) redirect("/trips");

  return { success: "Check your email to confirm your account, then sign in." };
}

export async function logoutSession(formData?: FormData): Promise<AuthActionState> {
  const auth = getAuthProvider();
  const user = await auth.getCurrentUser();
  try {
    await reportSuccessfulSignOut(
      async () => {
        await auth.signOut();
        return { error: null };
      },
      () =>
        captureServerProductEvent(
          "signed_out",
          { surface: telemetrySurface(formData?.get("surface")) ?? "global_header" },
          {
            actorType: user ? "authenticated" : "anonymous",
            route: "/login",
            appUserId: user?.id,
          },
        ),
    );
    return { success: "Signed out." };
  } catch {
    return { error: "Sign-out could not be completed. Please try again." };
  }
}

export async function logout(formData?: FormData) {
  const result = await logoutSession(formData);
  if (result.error) throw new Error(result.error);
  redirect("/login");
}
