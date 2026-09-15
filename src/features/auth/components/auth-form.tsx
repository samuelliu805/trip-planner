"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import Link from "next/link";
import { AlertCircle, Eye, EyeOff, Info, LoaderCircle, MailCheck } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import type { TurnstileInstance } from "@marsidev/react-turnstile";

import { Button } from "@/components/ui/button";
import { AutoDismissAlert } from "@/components/ui/auto-dismiss-alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthActionState } from "@/features/auth/types";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";
import { newTelemetryOperationId } from "@/lib/telemetry/product";

import { AuthCaptcha } from "./auth-captcha";
import { GoogleAuthButton } from "./google-auth-button";

type AuthFormProps = {
  action: (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;
  alternateHref?: string;
  alternateLead?: string;
  alternateLabel?: string;
  description: string;
  errorMessage?: string;
  heading: string;
  identifier: "email" | "username";
  mode: "login" | "signup";
  passwordRecoveryHref?: string;
  oauthAction?: (formData: FormData) => Promise<void>;
  submitLabel: string;
  turnstileSiteKey?: string;
};

const initialState: AuthActionState = {};

export function AuthForm({
  action,
  alternateHref,
  alternateLead,
  alternateLabel,
  description,
  errorMessage,
  heading,
  identifier,
  mode,
  passwordRecoveryHref,
  oauthAction,
  submitLabel,
  turnstileSiteKey,
}: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [captchaToken, setCaptchaToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const captchaRef = useRef<TurnstileInstance>(null);
  const googleOperationRef = useRef<HTMLInputElement>(null);
  const passwordOperationRef = useRef<HTMLInputElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    if (!state.error) return;
    captchaRef.current?.reset();
    queueMicrotask(() => setCaptchaToken(""));
  }, [state]);

  function captureAuthStart(method: "google" | "password", target: HTMLInputElement | null) {
    const operationId = newTelemetryOperationId();
    if (target) target.value = operationId;
    captureBrowserProductEvent(
      "auth_started",
      {
        auth_flow: mode,
        auth_method: method,
        operation_id: operationId,
        surface: "auth_form",
      },
      { actorType: "anonymous" },
    );
  }

  if (state.success) {
    return (
      <Card className="border-0 bg-transparent shadow-none sm:border sm:bg-card sm:shadow-sm">
        <CardContent className="flex flex-col items-center px-6 py-10 text-center sm:px-8">
          <div className="flex size-12 items-center justify-center rounded-full bg-accent text-primary">
            <MailCheck aria-hidden="true" className="size-6" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold">
            <T message={"Confirm your email"} />
          </h1>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground" role="status">
            <Localized value={state.success} />
          </p>
          <Button asChild className="mt-6 min-h-11 w-full">
            <Link href="/login">
              <T message={"Return to log in"} />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 bg-transparent shadow-none sm:border sm:bg-card sm:shadow-sm">
      <CardHeader className="space-y-2 px-0 pt-2 text-left sm:px-8 sm:pt-7 sm:text-center">
        <CardTitle className="text-2xl sm:text-[28px]">
          <Localized value={heading} />
        </CardTitle>
        <CardDescription className="text-sm">
          <Localized value={description} />
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-7 sm:px-8">
        {errorMessage ? (
          <AutoDismissAlert
            className="mb-4 rounded-lg shadow-none"
            role="alert"
            tone="destructive"
            value={errorMessage}
          >
            <div className="flex gap-2">
              <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <p>
                <Localized value={errorMessage} />
              </p>
            </div>
          </AutoDismissAlert>
        ) : null}
        {oauthAction ? (
          <>
            <form
              action={oauthAction}
              onSubmit={() => captureAuthStart("google", googleOperationRef.current)}
            >
              <input name="auth_flow" type="hidden" value={mode} />
              <input name="operation_id" ref={googleOperationRef} type="hidden" />
              <GoogleAuthButton />
            </form>
            <div className="my-5 flex items-center gap-3" role="separator">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <T message={" Or continue with email "} />
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
          </>
        ) : null}
        <form
          action={formAction}
          className="space-y-4"
          aria-busy={pending}
          onSubmit={() => captureAuthStart("password", passwordOperationRef.current)}
        >
          <input name="auth_flow" type="hidden" value={mode} />
          <input name="operation_id" ref={passwordOperationRef} type="hidden" />
          <input name="captcha_token" type="hidden" value={captchaToken} />
          {state.error ? (
            <AutoDismissAlert
              className="rounded-lg shadow-none"
              role="alert"
              tone="destructive"
              value={state.error}
            >
              <div className="flex gap-2">
                <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                <p>
                  <Localized value={state.error} />
                </p>
              </div>
            </AutoDismissAlert>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="credential">
              <T message={identifier === "username" ? "Username" : "Email address"} />
            </Label>
            <Input
              autoComplete={identifier === "username" ? "username" : "email"}
              className="h-11 text-base"
              id="credential"
              name="credential"
              placeholder={identifier === "username" ? t("Username") : "name@example.com"}
              data-i18n-placeholder={identifier === "username" ? "Username" : "name@example.com"}
              required
              type={identifier === "username" ? "text" : "email"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">
              <T message={"Password"} />
            </Label>
            <div className="relative">
              <Input
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                className="h-11 pr-12 text-base"
                id="password"
                minLength={mode === "signup" ? 8 : 1}
                name="password"
                placeholder={t(mode === "signup" ? "Create a password" : "Enter your password")}
                required
                type={showPassword ? "text" : "password"}
              />
              <button
                aria-label={t(showPassword ? "Hide password" : "Show password")}
                className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setShowPassword((visible) => !visible)}
                type="button"
              >
                {showPassword ? (
                  <EyeOff aria-hidden="true" className="size-5" />
                ) : (
                  <Eye aria-hidden="true" className="size-5" />
                )}
              </button>
            </div>
            {mode === "signup" ? (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Info aria-hidden="true" className="size-4" />{" "}
                <T message={" At least 8 characters "} />
              </p>
            ) : null}
          </div>
          {passwordRecoveryHref ? (
            <div className="-mt-2 flex justify-end">
              <Link
                className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline"
                href={passwordRecoveryHref}
              >
                <T message="Forgot password?" />
              </Link>
            </div>
          ) : null}
          <AuthCaptcha
            action={mode}
            onTokenChange={setCaptchaToken}
            ref={captchaRef}
            siteKey={turnstileSiteKey}
          />
          <Button
            className="min-h-11 w-full text-base"
            disabled={pending || Boolean(turnstileSiteKey && !captchaToken)}
            type="submit"
          >
            {pending ? (
              <>
                <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
                <T message={mode === "login" ? "Logging in…" : "Creating account…"} />
              </>
            ) : (
              <Localized value={submitLabel} />
            )}
          </Button>
          {alternateHref && alternateLead && alternateLabel ? (
            <p className="text-center text-sm text-muted-foreground">
              <Localized value={alternateLead} />{" "}
              <Link className="font-semibold text-primary hover:underline" href={alternateHref}>
                <Localized value={alternateLabel} />
              </Link>
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
