import type { Metadata } from "next";

import { AuthUnavailable } from "@/features/auth/components/auth-unavailable";
import { PhonePasswordReset } from "@/features/auth/components/phone-password-reset";
import { getRequestLocale } from "@/features/i18n/server";
import { translateMessage } from "@/features/i18n/translate";
import { getBackendCapabilities } from "@/platform/composition/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: translateMessage(await getRequestLocale(), "Reset password") };
}

export default function ForgotPasswordPage() {
  return getBackendCapabilities().passwordRecovery ? (
    <PhonePasswordReset />
  ) : (
    <AuthUnavailable mode="login" />
  );
}
