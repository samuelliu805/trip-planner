import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { continueWithGoogle, signup } from "@/features/auth/actions";
import { AuthForm } from "@/features/auth/components/auth-form";
import { AuthUnavailable } from "@/features/auth/components/auth-unavailable";
import { PhoneAuthForm } from "@/features/auth/components/phone-auth-form";
import { phoneOtpAuth } from "@/features/auth/phone-actions";
import { getRequestLocale } from "@/features/i18n/server";
import { translateMessage } from "@/features/i18n/translate";
import { getAuthProvider, getBackendCapabilities } from "@/platform/composition/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return { title: translateMessage(locale, "Sign up") };
}

export default async function SignupPage() {
  const user = await getAuthProvider().getCurrentUser();
  if (user) redirect("/trips");
  const capabilities = getBackendCapabilities();

  if (capabilities.publicAuthMethods.includes("phone_otp"))
    return <PhoneAuthForm action={phoneOtpAuth} mode="signup" />;
  if (!capabilities.publicAuthMethods.includes("email_password"))
    return <AuthUnavailable mode="signup" />;

  return (
    <AuthForm
      action={signup}
      alternateHref="/login"
      alternateLead="Already have an account?"
      alternateLabel="Log in"
      description="Start with your first trip in a few minutes."
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
