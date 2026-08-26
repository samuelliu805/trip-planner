"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { ArrowUpToLine, Plus, Trash2, X } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CarRentalDetails, ItineraryItemType } from "@/features/itinerary/types";

type LinkValue = { label: string; url: string };

const semanticLinkLabels = [
  "Ticket",
  "Booking",
  "Menu",
  "Website",
  "Check in",
  "Open",
  "Directions",
] as const;

export function ItemTimeField({
  carAction,
  fieldId,
  setStartTime,
  startTime,
  type,
}: {
  carAction: CarRentalDetails["action"];
  fieldId: string;
  setStartTime: Dispatch<SetStateAction<string>>;
  startTime: string;
  type: ItineraryItemType;
}) {
  const { t } = useI18n();
  const timeLabel =
    type === "location"
      ? "Arrival time"
      : type === "activity"
        ? "Time"
        : type === "meal"
          ? "Meal time"
          : carAction === "pickup"
            ? "Pickup time"
            : "Return time";
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={`item-time-${fieldId}-${type}`}>
        {t(timeLabel)}{" "}
        <span className="font-normal text-muted-foreground">
          <T message={"optional"} />
        </span>
      </Label>
      <div className="planner-native-control-frame relative min-w-0 max-w-full">
        <Input
          className="planner-native-time-input block min-w-0 max-w-full pr-12"
          id={`item-time-${fieldId}-${type}`}
          onChange={(event) => setStartTime(event.target.value)}
          type="time"
          value={startTime}
        />
        {startTime ? (
          <button
            aria-label="Clear time"
            data-i18n-aria-label={"Clear time"}
            className="absolute right-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setStartTime("")}
            tabIndex={-1}
            type="button"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ItemLinksField({
  linkLabel,
  links,
  setLinks,
}: {
  linkLabel: string;
  links: LinkValue[];
  setLinks: Dispatch<SetStateAction<LinkValue[]>>;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">
        <Localized value={linkLabel} />{" "}
        <span className="font-normal text-muted-foreground">
          <T message={"optional"} />
        </span>
      </legend>
      {links.map((link, index) => (
        <div
          className="grid min-w-0 grid-cols-[minmax(92px,112px)_minmax(0,1fr)_44px] gap-3"
          key={index}
        >
          <Select
            onValueChange={(label) =>
              setLinks((current) =>
                current.map((value, linkIndex) =>
                  linkIndex === index ? { ...value, label } : value,
                ),
              )
            }
            value={
              semanticLinkLabels.includes(link.label as (typeof semanticLinkLabels)[number])
                ? link.label
                : "Website"
            }
          >
            <SelectTrigger
              aria-label={t(index === 0 ? "Primary action label" : "Link action label")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {semanticLinkLabels.map((label) => (
                <SelectItem key={label} value={label}>
                  <Localized value={label} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            aria-label={
              index === 0 ? t("Primary URL") : t("Link {number} URL", { number: index + 1 })
            }
            onChange={(event) =>
              setLinks((current) =>
                current.map((value, linkIndex) =>
                  linkIndex === index ? { ...value, url: event.target.value } : value,
                ),
              )
            }
            placeholder="https://"
            data-i18n-placeholder={"https://"}
            type="url"
            value={link.url}
          />
          <Button
            aria-label={t("Remove link {number}", { number: index + 1 })}
            onClick={() =>
              setLinks((current) => current.filter((_, linkIndex) => linkIndex !== index))
            }
            className="size-11 p-0"
            size="sm"
            type="button"
            variant="ghost"
          >
            <Trash2 className="size-4" />
          </Button>
          {index === 0 ? (
            <span className="col-span-3 text-xs font-medium text-primary">
              <T message={"Primary action"} />
            </span>
          ) : (
            <button
              className="col-span-3 flex min-h-8 items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              onClick={() =>
                setLinks((current) => [
                  current[index],
                  ...current.filter((_, linkIndex) => linkIndex !== index),
                ])
              }
              type="button"
            >
              <ArrowUpToLine className="size-3.5" /> <T message={" Make Primary "} />
            </button>
          )}
        </div>
      ))}
      <Button
        onClick={() => setLinks((current) => [...current, { label: "Website", url: "" }])}
        size="sm"
        type="button"
        variant="outline"
      >
        <Plus className="size-4" /> <T message={" Add link "} />
      </Button>
      {links.length ? (
        <p className="text-xs text-muted-foreground">
          <T
            message={
              " The first link is the public Primary action. Remaining links appear under More links. "
            }
          />
        </p>
      ) : null}
    </fieldset>
  );
}

export function ItemNotesField({
  copyLabel,
  fieldId,
  notes,
  setNotes,
  type,
}: {
  copyLabel: string;
  fieldId: string;
  notes: string;
  setNotes: Dispatch<SetStateAction<string>>;
  type: ItineraryItemType;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <Label htmlFor={`item-notes-${fieldId}-${type}`}>
        <Localized value={copyLabel} /> <T message={" notes "} />
        <span className="font-normal text-muted-foreground">
          <T message={"optional"} />
        </span>
      </Label>
      <Textarea
        className="min-h-28"
        id={`item-notes-${fieldId}-${type}`}
        onChange={(event) => setNotes(event.target.value)}
        placeholder={t("Add {item} details", { item: t(copyLabel) })}
        value={notes}
      />
    </div>
  );
}
