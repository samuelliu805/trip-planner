"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { AuthActionState } from "@/features/auth/types";
import { siteUrlFromHeaders } from "@/features/sharing/site-url";
import { safeAuthErrorCode } from "@/lib/telemetry/errors";
import {
  telemetryAuthFlow,
  telemetryOperationId,
  telemetrySurface,
  reportSuccessfulSignOut,
} from "@/lib/telemetry/product";
import { captureServerProductEvent } from "@/lib/telemetry/product-server";

const credentialsSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

function authMetadata(formData: FormData, fallbackFlow: "login" | "signup") {
  return {
    authFlow: telemetryAuthFlow(formData.get("auth_flow")) ?? fallbackFlow,
    operationId: telemetryOperationId(formData.get("operation_id")),
  };
}

export async function login(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const metadata = authMetadata(formData, "login");
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
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

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
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
    return { error: "Email or password is incorrect." };
  }
  await captureServerProductEvent(
    "auth_succeeded",
    {
      auth_flow: metadata.authFlow,
      auth_method: "password",
      operation_id: metadata.operationId,
      surface: "auth_form",
    },
    { actorType: "authenticated", route: "/login", supabaseUserId: data.user.id },
  );
  redirect("/trips");
}

export async function continueWithGoogle(formData: FormData) {
  const metadata = authMetadata(formData, "login");
  const supabase = await createClient();
  const siteUrl = siteUrlFromHeaders(await headers());
  const callbackUrl = new URL("/auth/callback", siteUrl);
  callbackUrl.searchParams.set("auth_flow", metadata.authFlow);
  callbackUrl.searchParams.set("auth_method", "google");
  if (metadata.operationId) callbackUrl.searchParams.set("operation_id", metadata.operationId);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
      queryParams: { prompt: "select_account" },
    },
  });

  if (error || !data.url) {
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
  redirect(data.url);
}

export async function signup(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const metadata = authMetadata(formData, "signup");
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
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
  const supabase = await createClient();
  const confirmationUrl = siteUrl ? new URL("/auth/callback", siteUrl) : undefined;
  confirmationUrl?.searchParams.set("auth_flow", "confirmation");
  confirmationUrl?.searchParams.set("auth_method", "email_link");
  if (metadata.operationId) confirmationUrl?.searchParams.set("operation_id", metadata.operationId);
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: confirmationUrl ? { emailRedirectTo: confirmationUrl.toString() } : undefined,
  });

  if (error) {
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
    return { error: error.message };
  }
  await captureServerProductEvent(
    "auth_succeeded",
    {
      auth_flow: metadata.authFlow,
      auth_method: "password",
      operation_id: metadata.operationId,
      surface: "auth_form",
    },
    {
      actorType: data.user ? "authenticated" : "anonymous",
      route: "/signup",
      supabaseUserId: data.user?.id,
    },
  );
  if (data.session) redirect("/trips");

  return { success: "Check your email to confirm your account, then sign in." };
}

export async function logout(formData?: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await reportSuccessfulSignOut(
    () => supabase.auth.signOut(),
    () =>
      captureServerProductEvent(
        "signed_out",
        { surface: telemetrySurface(formData?.get("surface")) ?? "global_header" },
        {
          actorType: user ? "authenticated" : "anonymous",
          route: "/login",
          supabaseUserId: user?.id,
        },
      ),
  );
  redirect("/login");
}
