"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { EMAIL_SIGNUP_ENABLED } from "@/features/auth/config";
import type { AuthActionState } from "@/features/auth/types";
import { siteUrlFromHeaders } from "@/features/sharing/site-url";

const credentialsSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function login(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid credentials." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Email or password is incorrect." };
  redirect("/trips");
}

export async function continueWithGoogle() {
  const supabase = await createClient();
  const siteUrl = siteUrlFromHeaders(await headers());
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${siteUrl}/auth/callback`,
      queryParams: { prompt: "select_account" },
    },
  });

  if (error || !data.url) redirect("/login?error=google");
  redirect(data.url);
}

export async function signup(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!EMAIL_SIGNUP_ENABLED) {
    return { error: "Email signup is temporarily unavailable. Continue with Google." };
  }

  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid account details." };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: siteUrl ? { emailRedirectTo: `${siteUrl}/auth/callback` } : undefined,
  });

  if (error) return { error: error.message };
  if (data.session) redirect("/trips");

  return { success: "Check your email to confirm your account, then sign in." };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
