"use client";

import { Eye, EyeOff, Info } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { T, useI18n } from "@/features/i18n/i18n-provider";

export function MainlandPhoneField({
  name = "credential",
  onChange,
  value,
}: {
  name?: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="phone">
        <T message="Mobile number" />
      </Label>
      <div className="flex min-w-0 items-stretch rounded-md border border-input bg-transparent font-sans text-base leading-none focus-within:ring-2 focus-within:ring-ring">
        <span className="flex h-11 shrink-0 items-center pl-3 text-muted-foreground">+86</span>
        <Input
          autoComplete="tel-national"
          className="h-11 min-w-0 border-0 pl-2 text-base shadow-none focus-visible:ring-0 sm:text-base"
          id="phone"
          inputMode="numeric"
          maxLength={11}
          name={name}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 11))}
          pattern="[0-9]{11}"
          placeholder="13800138000"
          required
          type="tel"
          value={value}
        />
      </div>
    </div>
  );
}

export function AuthPasswordField({
  id = "password",
  label = "Password",
  name = "password",
  newPassword = false,
  onChange,
  value,
}: {
  id?: string;
  label?: string;
  name?: string;
  newPassword?: boolean;
  onChange?: (value: string) => void;
  value?: string;
}) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        <T message={label} />
      </Label>
      <div className="relative">
        <Input
          autoComplete={newPassword ? "new-password" : "current-password"}
          className="h-11 pr-12 text-base"
          id={id}
          maxLength={newPassword ? 32 : undefined}
          minLength={newPassword ? 8 : 1}
          name={name}
          onChange={onChange ? (event) => onChange(event.target.value) : undefined}
          pattern={newPassword ? "(?=.*[A-Za-z])(?=.*[0-9]).{8,32}" : undefined}
          placeholder={t(newPassword ? "Create a password" : "Enter your password")}
          required
          type={visible ? "text" : "password"}
          value={value}
        />
        <button
          aria-label={t(visible ? "Hide password" : "Show password")}
          className="absolute right-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setVisible((current) => !current)}
          type="button"
        >
          {visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
        </button>
      </div>
      {newPassword ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Info aria-hidden="true" className="size-4" />
          <T message="8–32 characters with letters and numbers" />
        </p>
      ) : null}
    </div>
  );
}
