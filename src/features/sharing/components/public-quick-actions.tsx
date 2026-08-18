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
      className={`public-quick-actions ${quiet ? "is-quiet" : ""} ${compact ? "is-compact shrink-0" : ""}`}
    >
      <a
        aria-label={`Open website ${primary.label}`}
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
          <span className="public-attachment-meta">Website</span>
        </span>
      </a>
      {secondary.length ? (
        <details className="relative">
          <summary
            aria-label={`Show ${secondary.length} more ${secondary.length === 1 ? "link" : "links"}`}
            className="public-resource-button touch-manipulation cursor-pointer list-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="public-attachment-visual" aria-hidden="true">
              <ChevronDown className="size-4" />
            </span>
            <span className="public-attachment-copy">
              <span className="public-attachment-name">More links</span>
              <span className="public-attachment-meta">{secondary.length} more</span>
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
