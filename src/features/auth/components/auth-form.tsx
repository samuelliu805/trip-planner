"use client";

import Link from "next/link";
import { AlertCircle, Eye, EyeOff, Info, LoaderCircle, MailCheck } from "lucide-react";
import { useActionState, useState } from "react";

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
  heading: string;
  mode: "login" | "signup";
  submitLabel: string;
};

const initialState: AuthActionState = {};

export function AuthForm({
  action,
  alternateHref,
  alternateLead,
  alternateLabel,
  description,
  heading,
  mode,
  submitLabel,
}: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [showPassword, setShowPassword] = useState(false);

  if (state.success) {
    return (
      <Card className="border-0 bg-transparent shadow-none sm:border sm:bg-card sm:shadow-sm">
        <CardContent className="flex flex-col items-center px-6 py-10 text-center sm:px-8">
          <div className="flex size-12 items-center justify-center rounded-full bg-accent text-primary">
            <MailCheck aria-hidden="true" className="size-6" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold">Confirm your email</h1>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground" role="status">
            {state.success}
          </p>
          <Button asChild className="mt-6 min-h-11 w-full">
            <Link href="/login">Return to log in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 bg-transparent shadow-none sm:border sm:bg-card sm:shadow-sm">
      <CardHeader className="space-y-2 px-0 pt-2 text-left sm:px-8 sm:pt-7 sm:text-center">
        <Link className="mb-2 text-2xl font-bold text-primary" href="/">
          Trip Planner
        </Link>
        <CardTitle className="text-2xl sm:text-[28px]">{heading}</CardTitle>
        <CardDescription className="text-sm">{description}</CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-7 sm:px-8">
        <form action={formAction} className="space-y-4" aria-busy={pending}>
          {state.error ? (
            <div
              className="flex gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
              role="alert"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <p>{state.error}</p>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              autoComplete="email"
              className="h-11 text-base"
              id="email"
              name="email"
              placeholder="name@example.com"
              required
              type="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                className="h-11 pr-12 text-base"
                id="password"
                minLength={8}
                name="password"
                placeholder={mode === "signup" ? "Create a password" : "Enter your password"}
                required
                type={showPassword ? "text" : "password"}
              />
              <button
                aria-label={showPassword ? "Hide password" : "Show password"}
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
                <Info aria-hidden="true" className="size-4" /> At least 8 characters
              </p>
            ) : null}
          </div>
          <Button className="min-h-11 w-full text-base" disabled={pending} type="submit">
            {pending ? (
              <>
                <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
                {mode === "login" ? "Logging in…" : "Creating account…"}
              </>
            ) : (
              submitLabel
            )}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {alternateLead}{" "}
            <Link className="font-semibold text-primary hover:underline" href={alternateHref}>
              {alternateLabel}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
