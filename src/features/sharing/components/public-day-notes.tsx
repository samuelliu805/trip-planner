"use client";

import { NotebookText } from "lucide-react";

import { T, useI18n } from "@/features/i18n/i18n-provider";
import { meaningfulText, publicItemAttachments } from "../editorial-presentation";
import type { PublicItineraryItem } from "../types";
import { PublicItemMediaGallery } from "./public-item-media";
import { OptionalNote } from "./editorial/day-plans";

export function PublicDayNotes({
  dayNotes,
  exporting = false,
  notes,
  onSelect,
  selectedItemRef,
}: {
  dayNotes?: string;
  exporting?: boolean;
  notes: PublicItineraryItem[];
  onSelect?: (ref: string) => void;
  selectedItemRef?: string;
}) {
  const { t } = useI18n();
  const text = meaningfulText(dayNotes);
  if (!notes.length && !text) return null;
  return (
    <aside
      aria-label={t("Shared notes")}
      className="my-3 min-w-0 space-y-2"
      data-public-day-notes=""
    >
      {notes.map((note) => {
        const content = (
          <>
            <NotebookText aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block whitespace-pre-wrap break-words font-medium">
                {note.title}
              </span>
              {meaningfulText(note.notes) ? (
                <span className="mt-1 block whitespace-pre-wrap break-words leading-5">
                  {note.notes}
                </span>
              ) : null}
            </span>
          </>
        );
        return (
          <div
            className="min-w-0 rounded-sm border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 shadow-sm"
            data-public-note-ref={note.ref}
            key={note.ref}
            role="note"
          >
            {exporting || !onSelect ? (
              <div className="flex min-w-0 items-start gap-2" data-public-item-ref={note.ref}>
                {content}
              </div>
            ) : (
              <button
                aria-current={selectedItemRef === note.ref ? "true" : undefined}
                className="flex min-h-11 w-full min-w-0 items-start gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-public-item-ref={note.ref}
                onClick={() => onSelect(note.ref)}
                type="button"
              >
                {content}
              </button>
            )}
            {exporting ? (
              publicItemAttachments(note).length ? (
                <p className="mt-2 break-words">
                  {publicItemAttachments(note)
                    .map(({ label }) => label)
                    .join(" · ")}
                </p>
              ) : null
            ) : (
              <PublicItemMediaGallery media={publicItemAttachments(note)} variant="timeline" />
            )}
          </div>
        );
      })}
      {text ? (
        <div
          className="min-w-0 rounded-sm border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 shadow-sm"
          role="note"
        >
          <span className="mb-1 flex items-center gap-2 font-medium">
            <NotebookText aria-hidden="true" className="size-4" />
            <T message="Notes" />
          </span>
          <OptionalNote text={text} exporting={exporting} />
        </div>
      ) : null}
    </aside>
  );
}
