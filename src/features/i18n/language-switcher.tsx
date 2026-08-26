"use client";

import { Languages } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { otherLocale } from "./config";
import { useI18n } from "./i18n-provider";

export function LanguageSwitcher({
  className,
  expanded = false,
}: {
  className?: string;
  expanded?: boolean;
}) {
  const { locale, setLocale, t } = useI18n();
  const nextLocale = otherLocale(locale);
  const label = nextLocale === "zh-CN" ? "简体中文" : "English";
  const ariaLabel = t("Switch to {language}", { language: label });

  return (
    <Button
      aria-label={ariaLabel}
      className={cn(
        expanded ? "min-h-11 w-full justify-start px-3 font-normal" : "size-11 shrink-0 p-0",
        className,
      )}
      onClick={() => setLocale(nextLocale)}
      type="button"
      variant="ghost"
    >
      <Languages aria-hidden="true" className="size-4 shrink-0" />
      {expanded ? <span>{label}</span> : null}
    </Button>
  );
}
