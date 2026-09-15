"use client";

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { forwardRef, useState } from "react";

import { T } from "@/features/i18n/i18n-provider";

type AuthCaptchaProps = {
  action: "login" | "password-recovery" | "signup";
  onTokenChange: (token: string) => void;
  siteKey?: string;
};

export const AuthCaptcha = forwardRef<TurnstileInstance, AuthCaptchaProps>(function AuthCaptcha(
  { action, onTokenChange, siteKey },
  ref,
) {
  const [failed, setFailed] = useState(false);

  if (!siteKey) return null;

  return (
    <div className="space-y-2">
      <Turnstile
        className="min-h-[65px] w-full overflow-hidden"
        data-testid="auth-turnstile"
        onError={() => {
          onTokenChange("");
          setFailed(true);
        }}
        onExpire={() => onTokenChange("")}
        onSuccess={(token) => {
          onTokenChange(token);
          setFailed(false);
        }}
        onTimeout={() => onTokenChange("")}
        options={{ action, size: "flexible", theme: "auto" }}
        ref={ref}
        siteKey={siteKey}
      />
      {failed ? (
        <p className="text-sm text-destructive" role="alert">
          <T message="Security check could not load. Refresh and try again." />
        </p>
      ) : null}
    </div>
  );
});
