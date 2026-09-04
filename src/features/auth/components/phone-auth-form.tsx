"use client";

import Link from "next/link";
import { AlertCircle, LoaderCircle, MessageSquareText } from "lucide-react";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { T, useI18n } from "@/features/i18n/i18n-provider";
import type { PhoneOtpActionState } from "@/features/auth/types";
import {
  maskMainlandPhone,
  normalizeMainlandPhone,
  phoneOtpResendState,
} from "@/features/auth/phone";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";
import { getBrowserPhoneOtpProvider } from "@/platform/composition/client-selected";
import type { BrowserPhoneOtpProvider } from "@/platform/contracts/auth";
import { PlatformOperationError } from "@/platform/contracts/errors";

type PhoneAuthFormProps = {
  action: (state: PhoneOtpActionState, formData: FormData) => Promise<PhoneOtpActionState>;
  mode: "login" | "signup";
};

const initialState: PhoneOtpActionState = { step: "phone" };

function safePhoneError(error: unknown) {
  if (
    error instanceof PlatformOperationError &&
    (error.code === "captcha_required" ||
      error.code === "otp_expired" ||
      error.code === "otp_invalid" ||
      error.code === "rate_limited")
  )
    return error.message;
  return "Phone sign-in could not be completed. Please try again.";
}

function ResendControls({ pending, resendAt }: { pending: boolean; resendAt: number }) {
  const [secondsRemaining, setSecondsRemaining] = useState(
    () => phoneOtpResendState(resendAt, pending).secondsRemaining,
  );

  useEffect(() => {
    const timer = window.setInterval(
      () => setSecondsRemaining(phoneOtpResendState(resendAt, pending).secondsRemaining),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [pending, resendAt]);

  return (
    <div className="flex min-w-0 items-center justify-between gap-3 text-sm">
      <button
        className="min-h-11 text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
        disabled={pending}
        name="intent"
        type="submit"
        value="reset"
      >
        <T message={"Change number"} />
      </button>
      <button
        className="min-h-11 text-right font-semibold text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
        disabled={phoneOtpResendState(resendAt, pending).disabled}
        name="intent"
        type="submit"
        value="request"
      >
        <T message={"Resend code"} />
        {secondsRemaining ? ` (${secondsRemaining}s)` : ""}
      </button>
    </div>
  );
}

export function PhoneAuthForm({ action, mode }: PhoneAuthFormProps) {
  const { t } = useI18n();
  const [phone, setPhone] = useState("");
  const operationRef = useRef<HTMLInputElement>(null);
  const providerRef = useRef<BrowserPhoneOtpProvider | null>(null);

  const browserAction = useCallback(
    async (state: PhoneOtpActionState, formData: FormData): Promise<PhoneOtpActionState> => {
      const intent = formData.get("intent");
      if (intent === "reset") {
        providerRef.current?.clearChallenge();
        return { step: "phone" };
      }
      if (intent === "request") {
        const normalizedPhone = normalizeMainlandPhone(formData.get("phone"));
        if (!normalizedPhone)
          return { ...state, error: "Enter a valid mainland China mobile number." };
        try {
          const provider = (providerRef.current ??= getBrowserPhoneOtpProvider());
          await provider.requestOtp(normalizedPhone);
          const requestedAt = Date.now();
          return {
            maskedPhone: maskMainlandPhone(normalizedPhone),
            resendAt: requestedAt + 60_000,
            step: "otp",
          };
        } catch (error) {
          return { ...state, error: safePhoneError(error) };
        }
      }
      const code = String(formData.get("code") ?? "").trim();
      if (!/^\d{6}$/.test(code)) return { ...state, error: "Enter the 6-digit code." };
      let tokens: Readonly<{ accessToken: string; refreshToken: string }>;
      try {
        const provider = (providerRef.current ??= getBrowserPhoneOtpProvider());
        tokens = await provider.verifyOtp(code);
      } catch (error) {
        return { ...state, error: safePhoneError(error) };
      }
      const session = new FormData();
      session.set("access_token", tokens.accessToken);
      session.set("auth_flow", mode);
      session.set("intent", "session");
      session.set("operation_id", String(formData.get("operation_id") ?? ""));
      session.set("refresh_token", tokens.refreshToken);
      const result = await action(state, session);
      return result.error ? { ...state, ...result } : result;
    },
    [action, mode],
  );
  const [state, formAction, pending] = useActionState(browserAction, initialState);

  function captureStart(event: React.FormEvent<HTMLFormElement>) {
    const intent = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
    if (intent === "reset") return;
    const operationId = newTelemetryOperationId();
    if (operationRef.current) operationRef.current.value = operationId;
    captureBrowserProductEvent(
      "auth_started",
      {
        auth_flow: mode,
        auth_method: "sms",
        operation_id: operationId,
        surface: "auth_form",
      },
      { actorType: "anonymous" },
    );
  }

  const heading = mode === "login" ? "Welcome back" : "Create your account";
  const description =
    mode === "login"
      ? "Use your mainland China mobile number to continue."
      : "Use your mainland China mobile number. New numbers are registered automatically.";

  return (
    <Card className="border-0 bg-transparent shadow-none sm:border sm:bg-card sm:shadow-sm">
      <CardHeader className="space-y-2 px-0 pt-2 text-left sm:px-8 sm:pt-7 sm:text-center">
        <Link className="mb-2 text-2xl font-bold text-primary" href="/">
          <T message={" Trip Planner "} />
        </Link>
        <CardTitle className="text-2xl sm:text-[28px]">
          <T message={heading} />
        </CardTitle>
        <CardDescription className="text-sm">
          <T message={description} />
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-7 sm:px-8">
        <form action={formAction} aria-busy={pending} className="space-y-4" onSubmit={captureStart}>
          <input name="auth_flow" type="hidden" value={mode} />
          <input name="operation_id" ref={operationRef} type="hidden" />
          {state.error ? (
            <div
              className="flex gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
              role="alert"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <p>
                <T message={state.error} />
              </p>
            </div>
          ) : null}
          {state.step === "phone" ? (
            <div className="space-y-2">
              <Label htmlFor="phone">
                <T message={"Mobile number"} />
              </Label>
              <div className="flex min-w-0 items-stretch rounded-md border border-input bg-transparent font-sans text-base leading-none focus-within:ring-2 focus-within:ring-ring">
                <span className="flex h-11 shrink-0 items-center pl-3 font-sans text-base leading-none text-muted-foreground">
                  +86
                </span>
                <Input
                  autoComplete="tel-national"
                  className="h-11 min-w-0 border-0 pl-2 font-sans text-base leading-none shadow-none sm:text-base focus-visible:ring-0"
                  id="phone"
                  inputMode="numeric"
                  maxLength={11}
                  name="phone"
                  onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 11))}
                  pattern="[0-9]{11}"
                  placeholder="13800138000"
                  required
                  type="tel"
                  value={phone}
                />
              </div>
            </div>
          ) : (
            <>
              <input name="phone" type="hidden" value={phone} />
              <div className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2 text-foreground">
                  <MessageSquareText aria-hidden="true" className="size-4 text-primary" />
                  <span>
                    <T message={"Code sent to"} /> {state.maskedPhone}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="verification-code">
                  <T message={"Verification code"} />
                </Label>
                <Input
                  autoComplete="one-time-code"
                  className="h-11 font-sans text-base leading-none tracking-[0.25em] sm:text-base"
                  id="verification-code"
                  inputMode="numeric"
                  maxLength={6}
                  name="code"
                  onInput={(event) => {
                    event.currentTarget.value = event.currentTarget.value
                      .replace(/\D/g, "")
                      .slice(0, 6);
                  }}
                  pattern="[0-9]{6}"
                  placeholder={t("6-digit code")}
                  required
                  type="text"
                />
              </div>
            </>
          )}
          <Button
            className="min-h-11 w-full text-base"
            disabled={pending}
            name="intent"
            type="submit"
            value={state.step === "phone" ? "request" : "verify"}
          >
            {pending ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : null}
            <T
              message={
                pending
                  ? state.step === "phone"
                    ? "Sending code…"
                    : "Verifying…"
                  : state.step === "phone"
                    ? "Send verification code"
                    : "Continue"
              }
            />
          </Button>
          {state.step === "otp" && state.resendAt ? (
            <ResendControls key={state.resendAt} pending={pending} resendAt={state.resendAt} />
          ) : null}
          <p className="text-center text-sm text-muted-foreground">
            <T message={mode === "login" ? "Don’t have an account?" : "Already have an account?"} />{" "}
            <Link
              className="font-semibold text-primary hover:underline"
              href={mode === "login" ? "/signup" : "/login"}
            >
              <T message={mode === "login" ? "Create account" : "Log in"} />
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
