import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { EmailPasswordResetForm } from "@/features/auth/components/email-password-reset-form";
import { getRequestLocale } from "@/features/i18n/server";
import { translateMessage } from "@/features/i18n/translate";
import { getAuthProvider, getBackendCapabilities } from "@/platform/composition/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: translateMessage(await getRequestLocale(), "Choose a new password") };
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ recovery?: string }>;
}) {
  const [{ recovery }, user] = await Promise.all([
    searchParams,
    getAuthProvider().getCurrentUser(),
  ]);
  if (!getBackendCapabilities().passwordRecovery || recovery !== "1" || !user) {
    redirect("/forgot-password?error=recovery");
  }
  return <EmailPasswordResetForm />;
}
