"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import {
  CarFront,
  Check,
  ChevronDown,
  Hotel,
  Plane,
  TrainFront,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { researchCategories, researchCategoryLabels, type ResearchCategory } from "../types";

const categoryDetails: Record<ResearchCategory, { description: string; Icon: LucideIcon }> = {
  flight: { description: "Airfares and flight ideas", Icon: Plane },
  rental: { description: "Rental car prices", Icon: CarFront },
  stay: { description: "Hotels and other stays", Icon: Hotel },
  train: { description: "Rail fares and train ideas", Icon: TrainFront },
};

export function MobileCategoryPicker({
  active,
  hrefs,
  onNavigate,
}: {
  active: ResearchCategory;
  hrefs: Record<ResearchCategory, string>;
  onNavigate: (category: ResearchCategory) => void;
}) {
  const { t } = useI18n();
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          aria-label={t("Price category: {category}", {
            category: t(researchCategoryLabels[active]),
          })}
          className="h-11 w-[7.5rem] min-w-0 justify-between px-3 sm:hidden"
          variant="outline"
        >
          <span className="truncate">
            <Localized value={researchCategoryLabels[active]} />
          </span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
        </Button>
      </SheetTrigger>
      <SheetContent className="p-0" side="bottom">
        <SheetHeader className="py-4">
          <SheetTitle>
            <T message={"Choose category"} />
          </SheetTitle>
          <SheetDescription>
            <T message={"Switch the prices and ideas you are comparing."} />
          </SheetDescription>
        </SheetHeader>
        <nav
          aria-label="Mobile price categories"
          data-i18n-aria-label={"Mobile price categories"}
          className="min-h-0 overflow-y-auto px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <div className="grid gap-2">
            {researchCategories.map((category) => {
              const { description, Icon } = categoryDetails[category];
              const selected = category === active;
              return (
                <SheetClose asChild key={category}>
                  <Link
                    aria-current={selected ? "page" : undefined}
                    className={`flex min-h-16 min-w-0 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      selected ? "border-primary bg-primary/10" : "bg-background hover:bg-muted"
                    }`}
                    href={hrefs[category]}
                    onClick={(event) => {
                      if (
                        event.button ||
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey ||
                        event.altKey
                      )
                        return;
                      event.preventDefault();
                      onNavigate(category);
                    }}
                    prefetch={false}
                  >
                    <span
                      className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
                        selected ? "bg-primary text-primary-foreground" : "bg-muted"
                      }`}
                    >
                      <Icon aria-hidden="true" className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">
                        <Localized value={researchCategoryLabels[category]} />
                      </span>
                      <span className="block truncate text-sm text-muted-foreground">
                        <Localized value={description} />
                      </span>
                    </span>
                    <Check
                      aria-hidden="true"
                      className={`size-5 shrink-0 text-primary ${selected ? "opacity-100" : "opacity-0"}`}
                    />
                  </Link>
                </SheetClose>
              );
            })}
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
