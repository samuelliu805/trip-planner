"use client";

import { T, useI18n } from "@/features/i18n/i18n-provider";
import { ChevronDown, ExternalLink } from "lucide-react";

import { actionLabel, safeExternalUrl } from "../presentation";
import type { PublicItineraryItem } from "../types";

export function PublicQuickActions({
  compact = false,
  item,
  quiet = false,
}: {
  compact?: boolean;
  item: PublicItineraryItem;
  quiet?: boolean;
}) {
  const { t } = useI18n();
  const links = (item.links ?? []).flatMap((link) => {
    const url = safeExternalUrl(link.url);
    return url ? [{ ...link, label: actionLabel(link.label), url }] : [];
  });
  const [primary, ...secondary] = links;
  if (!primary) return null;

  return (
    <div
      className={`public-quick-actions ${quiet ? "is-quiet" : ""} ${compact ? "is-compact shrink-0" : ""}`}
    >
      <a
        aria-label={t("Open website {label}", { label: primary.label })}
        className="public-resource-button touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href={primary.url}
        rel="noopener noreferrer"
        target="_blank"
      >
        <span className="public-attachment-visual" aria-hidden="true">
          <ExternalLink className="size-4" />
        </span>
        <span className="public-attachment-copy">
          <span className="public-attachment-name">{primary.label}</span>
          <span className="public-attachment-meta">
            <T message={"Website"} />
          </span>
        </span>
      </a>
      {secondary.length ? (
        <details className="relative">
          <summary
            aria-label={t("Show {count} more link(s)", { count: secondary.length })}
            className="public-resource-button touch-manipulation cursor-pointer list-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="public-attachment-visual" aria-hidden="true">
              <ChevronDown className="size-4" />
            </span>
            <span className="public-attachment-copy">
              <span className="public-attachment-name">
                <T message={"More links"} />
              </span>
              <span className="public-attachment-meta">
                {t("{count} more link(s)", { count: secondary.length })}
              </span>
            </span>
          </summary>
          <div className="absolute right-0 top-full z-[120] mt-1 min-w-36 border bg-background p-1 shadow-lg">
            {secondary.map((link, index) => (
              <a
                className="flex min-h-11 touch-manipulation items-center justify-between gap-3 rounded px-2 py-1.5 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-10 sm:text-xs"
                href={link.url}
                key={`${link.url}:${index}`}
                rel="noopener noreferrer"
                target="_blank"
              >
                {link.label}
                <ExternalLink aria-hidden="true" className="size-3" />
              </a>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
