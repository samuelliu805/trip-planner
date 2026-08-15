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
  const links = (item.links ?? []).flatMap((link) => {
    const url = safeExternalUrl(link.url);
    return url ? [{ ...link, label: actionLabel(link.label), url }] : [];
  });
  const [primary, ...secondary] = links;
  if (!primary) return null;

  return (
    <div
      className={`public-quick-actions flex flex-wrap items-center gap-1.5 ${quiet ? "is-quiet" : ""} ${compact ? "shrink-0" : "mt-2"}`}
    >
      <a
        className={`inline-flex min-h-11 touch-manipulation items-center gap-1 rounded px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8 sm:px-2.5 sm:text-xs ${quiet ? "text-muted-foreground hover:bg-muted hover:text-foreground" : "border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"}`}
        href={primary.url}
        rel="noopener noreferrer"
        target="_blank"
      >
        {primary.label}
        <ExternalLink aria-hidden="true" className="size-3" />
      </a>
      {secondary.length ? (
        <details className="relative">
          <summary className="flex min-h-11 touch-manipulation cursor-pointer list-none items-center gap-1 rounded px-2 text-sm font-medium text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8 sm:text-xs">
            More links <ChevronDown aria-hidden="true" className="size-3" />
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
