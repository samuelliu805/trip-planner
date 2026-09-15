import type { Metadata } from "next";

import { AuthUnavailable } from "@/features/auth/components/auth-unavailable";
import { EmailPasswordResetRequest } from "@/features/auth/components/email-password-reset-request";
import { PhonePasswordReset } from "@/features/auth/components/phone-password-reset";
import { turnstileSiteKey } from "@/features/auth/captcha";
import { getRequestLocale } from "@/features/i18n/server";
import { translateMessage } from "@/features/i18n/translate";
import { getBackendCapabilities } from "@/platform/composition/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: translateMessage(await getRequestLocale(), "Reset password") };
}

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const capabilities = getBackendCapabilities();
  if (!capabilities.passwordRecovery) return <AuthUnavailable mode="login" />;
  const { error } = await searchParams;
  return capabilities.publicAuthMethods.includes("email_password") ? (
    <EmailPasswordResetRequest
      errorMessage={
        error === "recovery"
          ? "The recovery link is invalid or expired. Request a new one."
          : undefined
      }
      siteKey={turnstileSiteKey()}
    />
  ) : (
    <PhonePasswordReset />
  );
}
