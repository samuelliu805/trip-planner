import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { continueWithGoogle, signup } from "@/features/auth/actions";
import { AuthForm } from "@/features/auth/components/auth-form";
import { AuthUnavailable } from "@/features/auth/components/auth-unavailable";
import { PhoneAuthForm } from "@/features/auth/components/phone-auth-form";
import { phoneOtpAuth } from "@/features/auth/phone-actions";
import { postLoginRefreshPath } from "@/features/auth/post-login";
import { getRequestLocale } from "@/features/i18n/server";
import { translateMessage } from "@/features/i18n/translate";
import { getAuthProvider, getBackendCapabilities } from "@/platform/composition/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return { title: translateMessage(locale, "Sign up") };
}

type SignupPageProps = {
  searchParams: Promise<{ guest?: string }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const [{ guest }, user] = await Promise.all([searchParams, getAuthProvider().getCurrentUser()]);
  if (user) redirect(guest === "1" ? postLoginRefreshPath : "/trips");
  const capabilities = getBackendCapabilities();

  if (capabilities.publicAuthMethods.includes("phone_otp"))
    return <PhoneAuthForm action={phoneOtpAuth} guest={guest === "1"} mode="signup" />;
  if (!capabilities.publicAuthMethods.includes("email_password"))
    return <AuthUnavailable mode="signup" />;

  return (
    <AuthForm
      action={signup}
      alternateHref={`/login${guest === "1" ? "?guest=1" : ""}`}
      alternateLead="Already have an account?"
      alternateLabel="Log in"
      description={
        guest === "1"
          ? "Create an account to save the local trip from this device."
          : "Start with your first trip in a few minutes."
      }
      heading="Create your account"
      identifier="email"
      mode="signup"
      oauthAction={
        capabilities.publicAuthMethods.includes("google_oauth") ? continueWithGoogle : undefined
      }
      submitLabel="Create account"
    />
  );
}
