"use client";

import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { AlertCircle, LoaderCircle, MailCheck } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { AutoDismissAlert } from "@/components/ui/auto-dismiss-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "@/features/auth/password-recovery-actions";
import { Localized, T } from "@/features/i18n/i18n-provider";

import { AuthCaptcha } from "./auth-captcha";

export function EmailPasswordResetRequest({
  errorMessage,
  siteKey,
}: {
  errorMessage?: string;
  siteKey?: string;
}) {
  const [state, action, pending] = useActionState(requestPasswordReset, {});
  const [captchaToken, setCaptchaToken] = useState("");
  const captchaRef = useRef<TurnstileInstance>(null);

  useEffect(() => {
    if (!state.error) return;
    captchaRef.current?.reset();
    queueMicrotask(() => setCaptchaToken(""));
  }, [state]);

  return (
    <Card className="border-0 bg-transparent shadow-none sm:border sm:bg-card sm:shadow-sm">
      <CardHeader className="space-y-2 px-0 pt-2 sm:px-8 sm:pt-7 sm:text-center">
        <CardTitle className="text-2xl sm:text-[28px]">
          <T message="Reset password" />
        </CardTitle>
        <CardDescription>
          <T message="Enter your email and we’ll send you a secure recovery link." />
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-7 sm:px-8">
        {errorMessage ? (
          <AutoDismissAlert className="mb-4" role="alert" tone="destructive" value={errorMessage}>
            <div className="flex gap-2">
              <AlertCircle className="mt-0.5 size-5 shrink-0" />
              <Localized value={errorMessage} />
            </div>
          </AutoDismissAlert>
        ) : null}
        {state.success ? (
          <div className="space-y-5 text-center" role="status">
            <MailCheck className="mx-auto size-10 text-primary" />
            <p className="text-sm leading-6 text-muted-foreground">
              <Localized value={state.success} />
            </p>
            <Button asChild className="min-h-11 w-full">
              <Link href="/login">
                <T message="Return to log in" />
              </Link>
            </Button>
          </div>
        ) : (
          <form action={action} aria-busy={pending} className="space-y-4">
            {state.error ? (
              <AutoDismissAlert role="alert" tone="destructive" value={state.error}>
                <div className="flex gap-2">
                  <AlertCircle className="mt-0.5 size-5 shrink-0" />
                  <Localized value={state.error} />
                </div>
              </AutoDismissAlert>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="recovery-email">
                <T message="Email address" />
              </Label>
              <Input
                autoComplete="email"
                className="h-11 text-base"
                id="recovery-email"
                name="email"
                placeholder="name@example.com"
                required
                type="email"
              />
            </div>
            <input name="captcha_token" type="hidden" value={captchaToken} />
            <AuthCaptcha
              action="password-recovery"
              onTokenChange={setCaptchaToken}
              ref={captchaRef}
              siteKey={siteKey}
            />
            <Button
              className="min-h-11 w-full"
              disabled={pending || Boolean(siteKey && !captchaToken)}
              type="submit"
            >
              {pending ? <LoaderCircle className="size-5 animate-spin" /> : null}
              <T message={pending ? "Sending recovery link…" : "Send recovery link"} />
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link className="font-semibold text-primary hover:underline" href="/login">
                <T message="Return to log in" />
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
