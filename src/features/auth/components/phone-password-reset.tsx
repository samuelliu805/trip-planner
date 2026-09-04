"use client";

import { AlertCircle, CircleCheckBig, LoaderCircle, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { AutoDismissAlert } from "@/components/ui/auto-dismiss-alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { maskMainlandPhone, normalizeMainlandPhone } from "@/features/auth/phone";
import { Localized, T } from "@/features/i18n/i18n-provider";
import { getBrowserPhoneOtpProvider } from "@/platform/composition/client-selected";
import type { BrowserPhoneOtpProvider } from "@/platform/contracts/auth";
import { PlatformOperationError } from "@/platform/contracts/errors";

import { AuthPasswordField, MainlandPhoneField } from "./phone-credential-fields";

function safeResetError(error: unknown) {
  if (error instanceof PlatformOperationError) return error.message;
  return "Password could not be reset. Please try again.";
}

export function PhonePasswordReset() {
  const providerRef = useRef<BrowserPhoneOtpProvider | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"phone" | "otp" | "done">("phone");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    const normalized = normalizeMainlandPhone(phone);
    if (!normalized) return setError("Enter a valid mainland China mobile number.");
    if (step === "otp" && !/^\d{6}$/.test(code)) return setError("Enter the 6-digit code.");
    if (step === "otp" && !/^(?=.*[A-Za-z])(?=.*\d).{8,32}$/.test(password)) {
      return setError("Use 8–32 characters with at least one letter and one number.");
    }
    setPending(true);
    try {
      const provider = (providerRef.current ??= getBrowserPhoneOtpProvider());
      if (step === "phone") {
        await provider.requestPasswordResetOtp(normalized);
        setStep("otp");
      } else {
        await provider.resetPassword(code, password);
        setStep("done");
      }
    } catch (caught) {
      setError(safeResetError(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="border-0 bg-transparent shadow-none sm:border sm:bg-card sm:shadow-sm">
      <CardHeader className="space-y-2 px-0 pt-2 sm:px-8 sm:pt-7 sm:text-center">
        <Link className="mb-2 text-2xl font-bold text-primary" href="/">
          <T message="Trip Planner" />
        </Link>
        <CardTitle className="text-2xl sm:text-[28px]">
          <T message="Reset password" />
        </CardTitle>
        <CardDescription>
          <T message="Verify your mainland China mobile number, then choose a new password." />
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-7 sm:px-8">
        {step === "done" ? (
          <div className="space-y-5 text-center" role="status">
            <CircleCheckBig className="mx-auto size-10 text-primary" />
            <p>
              <T message="Your password has been reset." />
            </p>
            <Button asChild className="min-h-11 w-full">
              <Link href="/login">
                <T message="Return to log in" />
              </Link>
            </Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            {error ? (
              <AutoDismissAlert
                className="rounded-lg shadow-none"
                role="alert"
                tone="destructive"
                value={error}
              >
                <div className="flex gap-2">
                  <AlertCircle className="mt-0.5 size-5 shrink-0" />
                  <Localized value={error} />
                </div>
              </AutoDismissAlert>
            ) : null}
            {step === "phone" ? (
              <MainlandPhoneField onChange={setPhone} value={phone} />
            ) : (
              <>
                <div className="flex items-center gap-2 rounded-lg bg-muted/60 p-3 text-sm">
                  <MessageSquareText className="size-4 text-primary" />
                  <T message="Code sent to" /> {maskMainlandPhone(normalizedMainland(phone))}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reset-code">
                    <T message="Verification code" />
                  </Label>
                  <Input
                    id="reset-code"
                    inputMode="numeric"
                    maxLength={6}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    required
                    value={code}
                  />
                </div>
                <AuthPasswordField
                  id="new-password"
                  label="New password"
                  newPassword
                  onChange={setPassword}
                  value={password}
                />
              </>
            )}
            <Button className="min-h-11 w-full" disabled={pending} type="submit">
              {pending ? <LoaderCircle className="size-5 animate-spin" /> : null}
              <T
                message={
                  pending
                    ? step === "phone"
                      ? "Sending code…"
                      : "Resetting…"
                    : step === "phone"
                      ? "Send verification code"
                      : "Reset password"
                }
              />
            </Button>
            {step === "otp" ? (
              <button
                className="min-h-11 text-sm text-muted-foreground hover:underline"
                onClick={() => {
                  providerRef.current?.clearChallenge();
                  setStep("phone");
                }}
                type="button"
              >
                <T message="Change number" />
              </button>
            ) : null}
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function normalizedMainland(phone: string) {
  return normalizeMainlandPhone(phone) ?? `+86${phone}`;
}
