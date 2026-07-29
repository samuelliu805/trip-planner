"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthActionState } from "@/features/auth/types";

type AuthFormProps = {
  action: (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;
  alternateHref: string;
  alternateLabel: string;
  submitLabel: string;
};

const initialState: AuthActionState = {};

export function AuthForm({ action, alternateHref, alternateLabel, submitLabel }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input autoComplete="email" id="email" name="email" required type="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input autoComplete={submitLabel === "Create account" ? "new-password" : "current-password"} id="password" minLength={8} name="password" required type="password" />
      </div>
      {state.error ? <p className="text-sm text-destructive" role="alert">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-primary" role="status">{state.success}</p> : null}
      <Button className="w-full" disabled={pending} type="submit">
        {pending ? "Please wait…" : submitLabel}
      </Button>
      <Button asChild className="w-full" variant="ghost">
        <Link href={alternateHref}>{alternateLabel}</Link>
      </Button>
    </form>
  );
}
