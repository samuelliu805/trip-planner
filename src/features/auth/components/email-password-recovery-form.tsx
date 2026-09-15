"use client";

import { AlertCircle, CircleCheckBig, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { AutoDismissAlert } from "@/components/ui/auto-dismiss-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completePasswordRecoveryFromEmailLink } from "@/features/auth/password-recovery-actions";
import { Localized, T } from "@/features/i18n/i18n-provider";

export function EmailPasswordRecoveryForm({
  operationId,
  tokenHash,
}: {
  operationId?: string;
  tokenHash?: string;
}) {
  const [state, action, pending] = useActionState(completePasswordRecoveryFromEmailLink, {});
  const validLink = Boolean(tokenHash);

  return (
    <Card className="border-0 bg-transparent shadow-none sm:border sm:bg-card sm:shadow-sm">
      <CardHeader className="space-y-2 px-0 pt-2 sm:px-8 sm:pt-7 sm:text-center">
        <CardTitle className="text-2xl sm:text-[28px]">
          <T message="Choose a new password" />
        </CardTitle>
        <CardDescription>
          <T message="Use 8–32 characters with at least one letter and one number." />
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-0 pb-7 sm:px-8">
        {state.success ? (
          <div className="space-y-5 text-center" role="status">
            <CircleCheckBig className="mx-auto size-10 text-primary" />
            <p>
              <Localized value={state.success} />
            </p>
            <Button asChild className="min-h-11 w-full">
              <Link href="/login">
                <T message="Return to log in" />
              </Link>
            </Button>
          </div>
        ) : (
          <>
            {!validLink || state.error ? (
              <AutoDismissAlert role="alert" tone="destructive" value={state.error}>
                <div className="flex gap-2">
                  <AlertCircle className="mt-0.5 size-5 shrink-0" />
                  <Localized
                    value={
                      state.error ?? "The recovery link is invalid or expired. Request a new one."
                    }
                  />
                </div>
              </AutoDismissAlert>
            ) : null}
            {validLink ? (
              <form action={action} aria-busy={pending} className="space-y-4">
                <input name="token_hash" type="hidden" value={tokenHash} />
                {operationId ? (
                  <input name="operation_id" type="hidden" value={operationId} />
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="recovery-password">
                    <T message="New password" />
                  </Label>
                  <Input
                    autoComplete="new-password"
                    className="h-11 text-base"
                    id="recovery-password"
                    maxLength={32}
                    minLength={8}
                    name="password"
                    required
                    type="password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recovery-password-confirmation">
                    <T message="Confirm new password" />
                  </Label>
                  <Input
                    autoComplete="new-password"
                    className="h-11 text-base"
                    id="recovery-password-confirmation"
                    maxLength={32}
                    minLength={8}
                    name="password_confirmation"
                    required
                    type="password"
                  />
                </div>
                <Button className="min-h-11 w-full" disabled={pending} type="submit">
                  {pending ? <LoaderCircle className="size-5 animate-spin" /> : null}
                  <T message={pending ? "Resetting…" : "Reset password"} />
                </Button>
              </form>
            ) : null}
            <Button asChild className="min-h-11 w-full" variant="outline">
              <Link href="/forgot-password">
                <T message="Send recovery link" />
              </Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
