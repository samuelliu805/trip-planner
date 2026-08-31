import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { continueWithGoogle, login } from "@/features/auth/actions";
import { AuthForm } from "@/features/auth/components/auth-form";
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

  return (
    <AuthForm
      action={login}
      alternateHref={capabilities.selfRegistration ? "/signup" : undefined}
      alternateLead={capabilities.selfRegistration ? "Don’t have an account?" : undefined}
      alternateLabel={capabilities.selfRegistration ? "Create account" : undefined}
      description="Sign in to continue planning your trips."
      errorMessage={errorMessage}
      heading="Welcome back"
      identifier={capabilities.passwordSignInIdentifier}
      mode="login"
      oauthAction={capabilities.googleOAuth ? continueWithGoogle : undefined}
      submitLabel="Log in"
    />
  );
}
