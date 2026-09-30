"use client";

import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/features/i18n/i18n-provider";
import type { PublicItineraryDay } from "../../types";
import { EditionDate, editionDayTitle } from "./edition-navigation";

export function EditionDayPager({
  days,
  index,
  onSelectDay,
}: {
  days: PublicItineraryDay[];
  index: number;
  onSelectDay: (ref: string) => void;
}) {
  const { t } = useI18n();
  const day = days[index];
  if (!day) return null;
  return (
    <nav className="edition-day-pager" aria-label={t("Shared days")}>
      <Button
        variant="ghost"
        className="size-11 p-0"
        disabled={index === 0}
        aria-label={t("Previous day")}
        onClick={() => onSelectDay(days[index - 1].ref)}
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
      </Button>
      <div className="edition-pager-current" aria-live="polite" aria-atomic="true">
        <strong>{t("Day {day}", { day: day.dayNumber })}</strong>
        <EditionDate day={day} />
        <span className="edition-pager-position">
          {index + 1} / {days.length}
        </span>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="size-11 p-0" aria-label={t("Choose day")}>
            <MoreHorizontal aria-hidden="true" className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-[60dvh] w-72 overflow-y-auto">
          <DropdownMenuRadioGroup value={day.ref} onValueChange={onSelectDay}>
            {days.map((entry) => (
              <DropdownMenuRadioItem key={entry.ref} value={entry.ref} className="min-h-11">
                <span className="min-w-0">
                  <strong>{t("Day {day}", { day: entry.dayNumber })}</strong>
                  <span className="ml-2">{editionDayTitle(entry, "")}</span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="ghost"
        className="size-11 p-0"
        disabled={index === days.length - 1}
        aria-label={t("Next day")}
        onClick={() => onSelectDay(days[index + 1].ref)}
      >
        <ChevronRight aria-hidden="true" className="size-4" />
      </Button>
    </nav>
  );
}
