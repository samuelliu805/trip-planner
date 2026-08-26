"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { T, useI18n } from "@/features/i18n/i18n-provider";
import { LanguageSwitcher } from "@/features/i18n/language-switcher";

import { formatShareImageExpiry } from "../long-image/expiration";

type ShareImagePagePart = {
  height: number;
  partNumber: number;
  width: 1080;
};

export function ShareImagePageContent({
  expiresAt,
  parts,
  permanentSlug,
  title,
  versionNumber,
}: {
  expiresAt: string | null;
  parts: ShareImagePagePart[];
  permanentSlug: string;
  title: string;
  versionNumber: number;
}) {
  const { locale, t } = useI18n();

  return (
    <div className="mx-auto max-w-[1120px] space-y-5">
      <header className="flex min-w-0 items-start justify-between gap-3 border bg-background p-4 sm:items-center">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            <T message="Shared trip image" />
          </p>
          <h1 className="mt-1 break-words text-xl font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {expiresAt ? (
              <>
                <T message="Available until" /> {formatShareImageExpiry(expiresAt, locale)} ·{" "}
              </>
            ) : null}
            <T message="Version" /> {versionNumber} ·{" "}
            {t("{count} image part(s)", { count: parts.length })}
          </p>
        </div>
        <LanguageSwitcher className="shrink-0" />
      </header>
      {parts.map((part) => {
        const source = `/share/image/${permanentSlug}/part/${part.partNumber}`;
        return (
          <figure className="space-y-2" key={part.partNumber}>
            {/* eslint-disable-next-line @next/next/no-img-element -- preserve the exact 1080 px export. */}
            <img
              alt={t("{title}, Timeline image part {part}", {
                part: part.partNumber,
                title,
              })}
              className="h-auto w-full border bg-white"
              height={part.height}
              loading={part.partNumber === 1 ? "eager" : "lazy"}
              src={source}
              width={part.width}
            />
            <div className="flex justify-end">
              <Button asChild className="min-h-11" variant="outline">
                <a download={`${title}-part-${part.partNumber}.jpg`} href={`${source}?download=1`}>
                  <Download className="size-4" />{" "}
                  <T message="Download part {part}" values={{ part: part.partNumber }} />
                </a>
              </Button>
            </div>
          </figure>
        );
      })}
    </div>
  );
}
