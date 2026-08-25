"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import Link from "next/link";
import { AlertCircle, Eye, EyeOff, Info, LoaderCircle, MailCheck } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthActionState } from "@/features/auth/types";

type AuthFormProps = {
  action: (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;
  alternateHref: string;
  alternateLead: string;
  alternateLabel: string;
  description: string;
  errorMessage?: string;
  heading: string;
  mode: "login" | "signup";
  oauthAction: () => Promise<void>;
  submitLabel: string;
};

const initialState: AuthActionState = {};

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24">
      <path
        d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.87h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.32 2.98-7.35Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.7 0 4.97-.9 6.62-2.42l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.59A10 10 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.39 13.9A6.02 6.02 0 0 1 6.08 12c0-.66.11-1.3.31-1.9V7.51H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.49l3.35-2.59Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.97c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.51l3.35 2.59C7.18 7.73 9.39 5.97 12 5.97Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function GoogleAuthButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      className="min-h-11 w-full text-base"
      disabled={pending}
      type="submit"
      variant="outline"
    >
      {pending ? (
        <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
      ) : (
        <GoogleMark />
      )}
      <T message={pending ? "Connecting to Google…" : "Continue with Google"} />
    </Button>
  );
}

export function AuthForm({
  action,
  alternateHref,
  alternateLead,
  alternateLabel,
  description,
  errorMessage,
  heading,
  mode,
  oauthAction,
  submitLabel,
}: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const { t } = useI18n();

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
        <Link className="mb-2 text-2xl font-bold text-primary" href="/">
          <T message={" Trip Planner "} />
        </Link>
        <CardTitle className="text-2xl sm:text-[28px]">
          <Localized value={heading} />
        </CardTitle>
        <CardDescription className="text-sm">
          <Localized value={description} />
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-7 sm:px-8">
        {errorMessage ? (
          <div
            className="mb-4 flex gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <p>
              <Localized value={errorMessage} />
            </p>
          </div>
        ) : null}
        <form action={oauthAction}>
          <GoogleAuthButton />
        </form>
        <div className="my-5 flex items-center gap-3" role="separator">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <T message={" Or continue with email "} />
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <form action={formAction} className="space-y-4" aria-busy={pending}>
          {state.error ? (
            <div
              className="flex gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
              role="alert"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <p>
                <Localized value={state.error} />
              </p>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="email">
              <T message={"Email address"} />
            </Label>
            <Input
              autoComplete="email"
              className="h-11 text-base"
              id="email"
              name="email"
              placeholder="name@example.com"
              data-i18n-placeholder={"name@example.com"}
              required
              type="email"
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
                minLength={8}
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
          <Button className="min-h-11 w-full text-base" disabled={pending} type="submit">
            {pending ? (
              <>
                <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
                <T message={mode === "login" ? "Logging in…" : "Creating account…"} />
              </>
            ) : (
              <Localized value={submitLabel} />
            )}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            <Localized value={alternateLead} />{" "}
            <Link className="font-semibold text-primary hover:underline" href={alternateHref}>
              <Localized value={alternateLabel} />
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
