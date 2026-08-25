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
        expanded ? "min-h-11 w-full justify-start px-3 font-normal" : "min-h-11",
        className,
      )}
      onClick={() => setLocale(nextLocale)}
      type="button"
      variant="ghost"
    >
      <Languages aria-hidden="true" className="size-4 shrink-0" />
      <span>{expanded ? label : nextLocale === "zh-CN" ? "中文" : "EN"}</span>
    </Button>
  );
}
