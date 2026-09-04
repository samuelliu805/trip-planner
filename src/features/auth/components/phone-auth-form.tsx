"use client";

import Link from "next/link";
import { AlertCircle, LoaderCircle, MessageSquareText } from "lucide-react";
import { useActionState, useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { AutoDismissAlert } from "@/components/ui/auto-dismiss-alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { T, useI18n } from "@/features/i18n/i18n-provider";
import type { PhoneOtpActionState } from "@/features/auth/types";
import type { AuthActionState } from "@/features/auth/types";
import { maskMainlandPhone, normalizeMainlandPhone } from "@/features/auth/phone";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";
import { getBrowserPhoneOtpProvider } from "@/platform/composition/client-selected";
import type { BrowserPhoneOtpProvider } from "@/platform/contracts/auth";
import { PlatformOperationError } from "@/platform/contracts/errors";

import { AuthPasswordField, MainlandPhoneField } from "./phone-credential-fields";
import { PhoneOtpResendControls } from "./phone-otp-resend-controls";
import { PhonePasswordLogin } from "./phone-password-login";

type PhoneAuthFormProps = {
  action: (state: PhoneOtpActionState, formData: FormData) => Promise<PhoneOtpActionState>;
  mode: "login" | "signup";
  passwordAction?: (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;
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

export function PhoneAuthForm({ action, mode, passwordAction }: PhoneAuthFormProps) {
  const { t } = useI18n();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loginMethod, setLoginMethod] = useState<"password" | "sms">("password");
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
        if (mode === "signup" && !/^(?=.*[A-Za-z])(?=.*\d).{8,32}$/.test(password)) {
          return {
            ...state,
            error: "Use 8–32 characters with at least one letter and one number.",
          };
        }
        try {
          const provider = (providerRef.current ??= getBrowserPhoneOtpProvider());
          await provider.requestOtp({
            intent: mode === "signup" ? "sign_up" : "sign_in",
            ...(mode === "signup" && { password }),
            phone: normalizedPhone,
          });
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
    [action, mode, password],
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
      : "Use your mainland China mobile number and create a password.";

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
        {mode === "login" && passwordAction ? (
          <div
            className="mb-5 grid grid-cols-2 rounded-lg bg-muted p-1"
            role="tablist"
            aria-label={t("Sign-in method")}
          >
            {(["password", "sms"] as const).map((method) => (
              <button
                aria-selected={loginMethod === method}
                className={`min-h-11 rounded-md px-3 text-sm font-semibold ${loginMethod === method ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
                key={method}
                onClick={() => setLoginMethod(method)}
                role="tab"
                type="button"
              >
                <T message={method === "password" ? "Password" : "SMS code"} />
              </button>
            ))}
          </div>
        ) : null}
        {mode === "login" && loginMethod === "password" && passwordAction ? (
          <PhonePasswordLogin action={passwordAction} />
        ) : (
          <form
            action={formAction}
            aria-busy={pending}
            className="space-y-4"
            onSubmit={captureStart}
          >
            <input name="auth_flow" type="hidden" value={mode} />
            <input name="operation_id" ref={operationRef} type="hidden" />
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
                    <T message={state.error} />
                  </p>
                </div>
              </AutoDismissAlert>
            ) : null}
            {state.step === "phone" ? (
              <>
                <MainlandPhoneField name="phone" onChange={setPhone} value={phone} />
                {mode === "signup" ? (
                  <AuthPasswordField newPassword onChange={setPassword} value={password} />
                ) : null}
              </>
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
              <PhoneOtpResendControls
                key={state.resendAt}
                pending={pending}
                resendAt={state.resendAt}
              />
            ) : null}
            <p className="text-center text-sm text-muted-foreground">
              <T
                message={mode === "login" ? "Don’t have an account?" : "Already have an account?"}
              />{" "}
              <Link
                className="font-semibold text-primary hover:underline"
                href={mode === "login" ? "/signup" : "/login"}
              >
                <T message={mode === "login" ? "Create account" : "Log in"} />
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
