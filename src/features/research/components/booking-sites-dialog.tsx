"use client";

import { Download, ExternalLink, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { T, useI18n } from "@/features/i18n/i18n-provider";

import {
  bookingSearchDetails,
  bookingSitesForCategory,
  bookingSitesForItem,
} from "../booking-sites";
import type { ResearchCategory, ResearchItem } from "../types";

type BookingSitesDialogProps = (
  { category: ResearchCategory; item?: never } | { category?: never; item: ResearchItem }
) & { toolbar?: boolean };

export function BookingSitesDialog(props: BookingSitesDialogProps) {
  const { t } = useI18n();
  const region = process.env.NEXT_PUBLIC_APP_REGION === "cn" ? "cn" : "global";
  const { item, toolbar = false } = props;
  const category = item ? (item.category as ResearchCategory) : props.category;
  const details = item ? bookingSearchDetails(item) : null;
  const sites = item
    ? bookingSitesForItem(item, region)
    : bookingSitesForCategory(category, region);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          aria-label={toolbar ? t("Search booking sites") : undefined}
          className={toolbar ? "size-11 shrink-0 p-0 sm:h-11 sm:w-auto sm:px-3" : "min-h-11 px-2.5"}
          size="sm"
          title={toolbar ? t("Search booking sites") : undefined}
          variant={toolbar ? "outline" : "ghost"}
        >
          <Search aria-hidden="true" className="size-4" />
          <span className={toolbar ? "hidden sm:inline" : undefined}>
            <T message={"Search sites"} />
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            <T message={"Search booking sites"} />
          </DialogTitle>
          <DialogDescription>
            <T message={"Browse booking sites, then add the options you want to compare."} />
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-5 py-5 sm:px-6">
          {details ? (
            <p className="research-safe-wrap rounded-lg border bg-muted/40 px-3 py-2.5 text-sm font-medium">
              {details}
            </p>
          ) : null}
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            {sites.map((site) => (
              <div
                className={
                  site.appStoreUrl
                    ? "grid min-w-0 grid-cols-[minmax(0,1fr)_3rem] gap-1 sm:block"
                    : "min-w-0"
                }
                key={site.name}
              >
                <Button
                  asChild
                  className="min-h-12 w-full min-w-0 justify-between px-3 text-left"
                  variant="outline"
                >
                  <a
                    aria-label={t("Open {site} in a new tab", { site: site.name })}
                    href={site.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span className="min-w-0 truncate font-semibold">{site.name}</span>
                    <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
                  </a>
                </Button>
                {site.appStoreUrl ? (
                  <Button
                    asChild
                    className="size-12 p-0 sm:hidden"
                    title={t("Get the {site} app", { site: site.name })}
                    variant="outline"
                  >
                    <a
                      aria-label={t("Get the {site} app", { site: site.name })}
                      href={site.appStoreUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <Download aria-hidden="true" className="size-4" />
                    </a>
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
