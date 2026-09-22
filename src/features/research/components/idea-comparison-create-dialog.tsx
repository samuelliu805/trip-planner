"use client";

import type { Dispatch, SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { T, useI18n } from "@/features/i18n/i18n-provider";

import type { ResearchItem } from "../types";
import { choiceLabel, itemLabel } from "./idea-comparison-labels";

export function IdeaComparisonCreateDialog({
  choices,
  error,
  items,
  onCreate,
  onOpenChange,
  onTitleChange,
  onToggle,
  open,
  pending,
  setChoices,
  title,
}: {
  choices: string[][];
  error?: string;
  items: ResearchItem[];
  onCreate: () => void;
  onOpenChange: (open: boolean) => void;
  onTitleChange: (title: string) => void;
  onToggle: (itemId: string, index: number) => void;
  open: boolean;
  pending: boolean;
  setChoices: Dispatch<SetStateAction<string[][]>>;
  title: string;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" onOpenAutoFocus={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>
            <T message="Compare ideas" />
          </DialogTitle>
          <DialogDescription>
            <T message="Put ideas into A and B, then choose one." />
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap gap-2">
            {choices.map((ids, index) => (
              <div
                className="flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                key={index}
              >
                <div className="flex items-center gap-2 font-semibold">
                  {t("Choice {letter}", { letter: choiceLabel(index) })}
                  {index > 1 ? (
                    <Button
                      aria-label={t("Remove choice {letter}", { letter: choiceLabel(index) })}
                      className="min-h-11"
                      onClick={() =>
                        setChoices((current) => current.filter((_, position) => position !== index))
                      }
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <T message="Remove" />
                    </Button>
                  ) : null}
                </div>
                <span className="text-muted-foreground">{ids.length}</span>
              </div>
            ))}
          </div>
          <Button
            className="min-h-11 px-2"
            onClick={() => setChoices((current) => [...current, []])}
            type="button"
            variant="ghost"
          >
            <T message="Add another choice" />
          </Button>
          <div className="space-y-2">
            {items.map((item) => (
              <div
                className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border p-2"
                key={item.id}
              >
                <span className="min-w-0 flex-1 break-words text-sm">{itemLabel(item)}</span>
                <div className="flex flex-wrap gap-1">
                  {choices.map((ids, index) => (
                    <Button
                      aria-label={t("Assign to choice {letter}", { letter: choiceLabel(index) })}
                      aria-pressed={ids.includes(item.id)}
                      className="min-h-11 min-w-11"
                      key={index}
                      onClick={() => onToggle(item.id, index)}
                      size="sm"
                      type="button"
                      variant={ids.includes(item.id) ? "default" : "outline"}
                    >
                      {choiceLabel(index)}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <label className="block text-sm font-medium text-muted-foreground">
            <T message="Name (optional)" />
            <input
              className="mt-1 min-h-11 w-full min-w-0 rounded-md border bg-background px-3 text-foreground"
              maxLength={160}
              onChange={(event) => onTitleChange(event.target.value)}
              value={title}
            />
          </label>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            disabled={pending || choices.length < 2 || choices.some((choice) => !choice.length)}
            onClick={onCreate}
            type="button"
          >
            <T message="Create comparison" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
