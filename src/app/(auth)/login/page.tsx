import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { continueWithGoogle, login } from "@/features/auth/actions";
import { AuthForm } from "@/features/auth/components/auth-form";
import { AuthUnavailable } from "@/features/auth/components/auth-unavailable";
import { PhoneAuthForm } from "@/features/auth/components/phone-auth-form";
import { phoneOtpAuth } from "@/features/auth/phone-actions";
import { getRequestLocale } from "@/features/i18n/server";
import { translateMessage } from "@/features/i18n/translate";
import { getAuthProvider, getBackendCapabilities } from "@/platform/composition/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return { title: translateMessage(locale, "Log in") };
}

type LoginPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [{ error }, user] = await Promise.all([searchParams, getAuthProvider().getCurrentUser()]);
  if (user) redirect("/trips");
  const capabilities = getBackendCapabilities();

  const errorMessage =
    error === "google"
      ? "Google sign-in could not be completed. Please try again."
      : error === "confirmation"
        ? "The confirmation link is invalid or expired. Please try again."
        : undefined;

  if (capabilities.publicAuthMethods.includes("phone_otp")) {
    return <PhoneAuthForm action={phoneOtpAuth} mode="login" passwordAction={login} />;
  }

  const identifier = capabilities.publicAuthMethods.includes("email_password")
    ? "email"
    : capabilities.protectedAuthMethods.includes("username_password")
      ? "username"
      : null;
  if (!identifier) return <AuthUnavailable mode="login" />;

  return (
    <AuthForm
      action={login}
      alternateHref={
        capabilities.publicAuthMethods.includes("email_password") ? "/signup" : undefined
      }
      alternateLead={
        capabilities.publicAuthMethods.includes("email_password")
          ? "Don’t have an account?"
          : undefined
      }
      alternateLabel={
        capabilities.publicAuthMethods.includes("email_password") ? "Create account" : undefined
      }
      description="Sign in to continue planning your trips."
      errorMessage={errorMessage}
      heading="Welcome back"
      identifier={identifier}
      mode="login"
      oauthAction={
        capabilities.publicAuthMethods.includes("google_oauth") ? continueWithGoogle : undefined
      }
      submitLabel="Log in"
    />
  );
}
