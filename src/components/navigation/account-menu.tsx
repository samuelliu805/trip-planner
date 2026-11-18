"use client";

import {
  ChevronDown,
  Languages,
  Lightbulb,
  LogOut,
  MoreHorizontal,
  Settings2,
  Sparkles,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { T, useI18n } from "@/features/i18n/i18n-provider";
import { otherLocale } from "@/features/i18n/config";
import { logout } from "@/features/auth/actions";

export function AccountMenu({ identityLabel }: { identityLabel: string }) {
  const { locale, setLocale, t } = useI18n();
  const nextLocale = otherLocale(locale);
  const languageLabel = nextLocale === "zh-CN" ? "简体中文" : "English";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t("Account menu")}
          data-i18n-aria-label="Account menu"
          className="min-h-11 min-w-11 px-2 sm:px-3"
          title={identityLabel}
          variant="ghost"
        >
          <MoreHorizontal aria-hidden="true" className="size-5 sm:hidden" />
          <UserRound aria-hidden="true" className="hidden size-4 shrink-0 sm:block" />
          <span className="hidden max-w-64 truncate sm:inline">{identityLabel}</span>
          <ChevronDown aria-hidden="true" className="hidden size-3 shrink-0 sm:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-2rem)] rounded-xl p-1.5">
        <p className="truncate px-3 py-2 text-xs text-muted-foreground" title={identityLabel}>
          {identityLabel}
        </p>
        <DropdownMenuItem asChild className="min-h-11 rounded-lg">
          <Link href="/account">
            <Settings2 aria-hidden="true" className="size-4 text-muted-foreground" />
            <T message="Account settings" />
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="min-h-11 rounded-lg">
          <Link href="/ideas">
            <Lightbulb aria-hidden="true" className="size-4 text-muted-foreground" />
            <T message="Personal ideas" />
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="min-h-11 rounded-lg">
          <Link href="/account/ai">
            <Sparkles aria-hidden="true" className="size-4 text-muted-foreground" />
            <T message="Connect your AI" />
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          aria-label={t("Switch to {language}", { language: languageLabel })}
          className="min-h-11 rounded-lg"
          onSelect={() => setLocale(nextLocale)}
        >
          <Languages aria-hidden="true" className="size-4 text-muted-foreground" />
          {languageLabel}
        </DropdownMenuItem>
        <form action={logout}>
          <input name="surface" type="hidden" value="global_header" />
          <DropdownMenuItem
            asChild
            className="min-h-11 w-full rounded-lg"
            onSelect={(event) => event.preventDefault()}
          >
            <button aria-label={t("Log out")} data-i18n-aria-label="Log out" type="submit">
              <LogOut aria-hidden="true" className="size-4 text-muted-foreground" />
              <T message="Log out" />
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
