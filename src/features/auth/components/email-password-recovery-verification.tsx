"use client";

import { AlertCircle, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { AutoDismissAlert } from "@/components/ui/auto-dismiss-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { verifyPasswordRecoveryToken } from "@/features/auth/password-recovery-actions";
import { Localized, T } from "@/features/i18n/i18n-provider";

export function EmailPasswordRecoveryVerification({
  operationId,
  tokenHash,
}: {
  operationId?: string;
  tokenHash?: string;
}) {
  const [state, action, pending] = useActionState(verifyPasswordRecoveryToken, {});
  const validLink = Boolean(tokenHash);

  return (
    <Card className="border-0 bg-transparent shadow-none sm:border sm:bg-card sm:shadow-sm">
      <CardHeader className="space-y-2 px-0 pt-2 sm:px-8 sm:pt-7 sm:text-center">
        <ShieldCheck className="mx-auto size-10 text-primary" />
        <CardTitle className="text-2xl sm:text-[28px]">
          <T message="Continue password recovery" />
        </CardTitle>
        <CardDescription>
          <T message="For your security, confirm that you want to use this email recovery link." />
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-0 pb-7 sm:px-8">
        {!validLink || state.error ? (
          <AutoDismissAlert role="alert" tone="destructive" value={state.error}>
            <div className="flex gap-2">
              <AlertCircle className="mt-0.5 size-5 shrink-0" />
              <Localized
                value={state.error ?? "The recovery link is invalid or expired. Request a new one."}
              />
            </div>
          </AutoDismissAlert>
        ) : null}
        {validLink ? (
          <form action={action} aria-busy={pending}>
            <input name="token_hash" type="hidden" value={tokenHash} />
            {operationId ? <input name="operation_id" type="hidden" value={operationId} /> : null}
            <Button className="min-h-11 w-full" disabled={pending} type="submit">
              {pending ? <LoaderCircle className="size-5 animate-spin" /> : null}
              <T message={pending ? "Verifying…" : "Continue to reset password"} />
            </Button>
          </form>
        ) : null}
        <Button asChild className="min-h-11 w-full" variant="outline">
          <Link href="/forgot-password">
            <T message="Send recovery link" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
