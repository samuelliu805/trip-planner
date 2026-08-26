"use client";

import { ExternalLink, Search } from "lucide-react";

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

import { bookingSearchDetails, bookingSitesForItem } from "../booking-sites";
import type { ResearchItem } from "../types";

export function BookingSitesDialog({ item }: { item: ResearchItem }) {
  const { t } = useI18n();
  const details = bookingSearchDetails(item);
  const sites = bookingSitesForItem(item);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="min-h-11 px-2.5" size="sm" variant="ghost">
          <Search aria-hidden="true" className="size-4" />
          <T message={"Search sites"} />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            <T message={"Search booking sites"} />
          </DialogTitle>
          <DialogDescription>
            <T message={"Trip details are included when a site supports a reliable search link."} />
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-5 py-5 sm:px-6">
          <div className="min-w-0 rounded-lg border bg-muted/40 px-3 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <T message={"Search details"} />
            </p>
            <p className="research-safe-wrap mt-1 text-sm font-medium">
              {details || <T message={"No route details saved yet"} />}
            </p>
          </div>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            {sites.map((site) => (
              <Button
                asChild
                className="h-auto min-h-14 min-w-0 justify-between whitespace-normal px-3 py-2 text-left"
                key={site.name}
                variant="outline"
              >
                <a
                  aria-label={t("Open {site} in a new tab", { site: site.name })}
                  href={site.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold">{site.name}</span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      <T
                        message={
                          site.includesDetails ? "Details included" : "Enter details on site"
                        }
                      />
                    </span>
                  </span>
                  <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
                </a>
              </Button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
