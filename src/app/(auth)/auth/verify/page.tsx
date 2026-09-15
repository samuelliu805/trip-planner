import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthUnavailable } from "@/features/auth/components/auth-unavailable";
import { EmailPasswordRecoveryVerification } from "@/features/auth/components/email-password-recovery-verification";
import { getRequestLocale } from "@/features/i18n/server";
import { translateMessage } from "@/features/i18n/translate";
import { siteUrlFromHeaders } from "@/features/sharing/site-url";
import { telemetryOperationId } from "@/lib/telemetry/product";
import { getBackendCapabilities } from "@/platform/composition/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: translateMessage(await getRequestLocale(), "Continue password recovery") };
}

export default async function VerifyEmailLinkPage({
  searchParams,
}: {
  searchParams: Promise<{
    auth_flow?: string;
    auth_method?: string;
    code?: string;
    operation_id?: string;
    token_hash?: string;
    type?: string;
  }>;
}) {
  if (!getBackendCapabilities().passwordRecovery) return <AuthUnavailable mode="login" />;
  const parameters = await searchParams;
  const operationId = telemetryOperationId(parameters.operation_id);

  if (parameters.code) {
    const callbackUrl = new URL("/auth/callback", siteUrlFromHeaders(await headers()));
    callbackUrl.searchParams.set("code", parameters.code);
    callbackUrl.searchParams.set("auth_flow", "recovery");
    callbackUrl.searchParams.set("auth_method", "email_link");
    if (operationId) callbackUrl.searchParams.set("operation_id", operationId);
    redirect(callbackUrl.toString());
  }

  return (
    <EmailPasswordRecoveryVerification
      operationId={operationId}
      tokenHash={parameters.type === "recovery" ? parameters.token_hash : undefined}
    />
  );
}
