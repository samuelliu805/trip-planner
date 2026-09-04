"use client";

import { useEffect, useState } from "react";

import { T } from "@/features/i18n/i18n-provider";
import { phoneOtpResendState } from "@/features/auth/phone";

export function PhoneOtpResendControls({
  pending,
  resendAt,
}: {
  pending: boolean;
  resendAt: number;
}) {
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
