"use client";

import { AlertCircle, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { AutoDismissAlert } from "@/components/ui/auto-dismiss-alert";
import type { AuthActionState } from "@/features/auth/types";
import { Localized, T } from "@/features/i18n/i18n-provider";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";

import { AuthPasswordField, MainlandPhoneField } from "./phone-credential-fields";

export function PhonePasswordLogin({
  action,
}: {
  action: (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [phone, setPhone] = useState("");
  const operationRef = useRef<HTMLInputElement>(null);
  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="space-y-4"
      onSubmit={() => {
        const operationId = newTelemetryOperationId();
        if (operationRef.current) operationRef.current.value = operationId;
        captureBrowserProductEvent(
          "auth_started",
          {
            auth_flow: "login",
            auth_method: "password",
            operation_id: operationId,
            surface: "auth_form",
          },
          { actorType: "anonymous" },
        );
      }}
    >
      <input name="auth_flow" type="hidden" value="login" />
      <input name="credential_kind" type="hidden" value="phone" />
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
            <Localized value={state.error} />
          </div>
        </AutoDismissAlert>
      ) : null}
      <MainlandPhoneField onChange={setPhone} value={phone} />
      <AuthPasswordField />
      <div className="text-right">
        <Link
          className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline"
          href="/forgot-password"
        >
          <T message="Forgot password?" />
        </Link>
      </div>
      <Button className="min-h-11 w-full text-base" disabled={pending} type="submit">
        {pending ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : null}
        <T message={pending ? "Logging in…" : "Log in"} />
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        <T message="Don’t have an account?" />{" "}
        <Link className="font-semibold text-primary hover:underline" href="/signup">
          <T message="Create account" />
        </Link>
      </p>
    </form>
  );
}
