import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AccountPasswordEditor } from "@/features/account/components/account-password-editor";
import { AuthenticatedGuestStorageCleanup } from "@/features/guest/components/authenticated-guest-storage-cleanup";
import { getRequestLocale } from "@/features/i18n/server";
import { translateMessage } from "@/features/i18n/translate";
import { getAuthProvider, getBackendCapabilities } from "@/platform/composition/server";

export async function generateMetadata(): Promise<Metadata> {
  return {
    robots: { follow: false, index: false, noarchive: true },
    title: translateMessage(await getRequestLocale(), "Change password"),
  };
}

export default async function AccountPasswordPage() {
  if (!(await getAuthProvider().getCurrentUser())) redirect("/login");
  const capabilities = getBackendCapabilities();
  if (!capabilities.passwordManagement) redirect("/account");
  return (
    <main className="min-h-dvh bg-muted">
      <AuthenticatedGuestStorageCleanup />
      <AccountPasswordEditor passwordRecovery={capabilities.passwordRecovery} />
    </main>
  );
}
