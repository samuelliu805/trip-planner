"use client";

import { ExternalLink } from "lucide-react";
import { useI18n } from "@/features/i18n/i18n-provider";
import { actionLabel, safeExternalUrl } from "../presentation";
import type { PublicItineraryItem } from "../types";

export function PublicInlineLinks({ item }: { item: PublicItineraryItem }) {
  const { t } = useI18n();
  const links = (item.links ?? []).flatMap((link) => {
    const url = safeExternalUrl(link.url);
    return url ? [{ url, label: actionLabel(link.label) }] : [];
  });
  if (!links.length) return null;
  return (
    <div className="public-inline-links">
      {links.map((link, index) => (
        <a
          key={`${link.url}:${index}`}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("Open website {label}", { label: link.label })}
        >
          <span>{link.label}</span>
          <ExternalLink aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}
