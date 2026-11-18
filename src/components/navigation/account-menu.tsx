"use client";

import { ChevronDown, Lightbulb, Settings2, Sparkles, UserRound } from "lucide-react";
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

export function AccountMenu({ identityLabel }: { identityLabel: string }) {
  const { t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t("Account menu")}
          className="min-h-11 min-w-11 px-2 sm:px-3"
          title={identityLabel}
          variant="ghost"
        >
          <UserRound aria-hidden="true" className="size-4 shrink-0" />
          <span className="hidden max-w-28 truncate min-[480px]:inline sm:max-w-64">
            {identityLabel}
          </span>
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
