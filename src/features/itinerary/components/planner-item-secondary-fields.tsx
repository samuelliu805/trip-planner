"use client";

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
import type {
  CarRentalDetails,
  ItineraryItem,
  ItineraryItemType,
} from "@/features/itinerary/types";

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

export function PlannerItemSecondaryFields({
  carAction,
  copyLabel,
  dayId,
  endTime,
  item,
  linkLabel,
  links,
  notes,
  setEndTime,
  setLinks,
  setNotes,
  setStartTime,
  startTime,
  type,
}: {
  carAction: CarRentalDetails["action"];
  copyLabel: string;
  dayId: string;
  endTime: string;
  item?: ItineraryItem;
  linkLabel: string;
  links: LinkValue[];
  notes: string;
  setEndTime: Dispatch<SetStateAction<string>>;
  setLinks: Dispatch<SetStateAction<LinkValue[]>>;
  setNotes: Dispatch<SetStateAction<string>>;
  setStartTime: Dispatch<SetStateAction<string>>;
  startTime: string;
  type: ItineraryItemType;
}) {
  return (
    <>
      {["location", "activity"].includes(type) ? (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`item-start-${item?.id ?? dayId}-${type}`}>
              {type === "location" ? "Arrive" : "Start time"}{" "}
              <span className="font-normal text-muted-foreground">optional</span>
            </Label>
            <div className="relative min-w-0">
              <Input
                className="min-w-0 pr-9"
                id={`item-start-${item?.id ?? dayId}-${type}`}
                onChange={(event) => setStartTime(event.target.value)}
                type="time"
                value={startTime}
              />
              {startTime ? (
                <button
                  aria-label="Clear start time"
                  className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setStartTime("")}
                  tabIndex={-1}
                  type="button"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`item-end-${item?.id ?? dayId}-${type}`}>
              {type === "location" ? "Leave" : "End time"}{" "}
              <span className="font-normal text-muted-foreground">optional</span>
            </Label>
            <div className="relative min-w-0">
              <Input
                className="min-w-0 pr-9"
                id={`item-end-${item?.id ?? dayId}-${type}`}
                onChange={(event) => setEndTime(event.target.value)}
                type="time"
                value={endTime}
              />
              {endTime ? (
                <button
                  aria-label="Clear end time"
                  className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setEndTime("")}
                  tabIndex={-1}
                  type="button"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {["car_rental", "meal"].includes(type) ? (
        <div className="space-y-1.5">
          <Label htmlFor={`item-time-${item?.id ?? dayId}-${type}`}>
            {type === "meal" ? "Meal time" : `${carAction === "pickup" ? "Pickup" : "Return"} time`}{" "}
            <span className="font-normal text-muted-foreground">optional</span>
          </Label>
          <Input
            id={`item-time-${item?.id ?? dayId}-${type}`}
            onChange={(event) => setStartTime(event.target.value)}
            type="time"
            value={startTime}
          />
        </div>
      ) : null}
      {!["location", "note"].includes(type) ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            {linkLabel} <span className="font-normal text-muted-foreground">optional</span>
          </legend>
          {links.map((link, index) => (
            <div
              className="grid min-w-0 grid-cols-[minmax(92px,112px)_minmax(0,1fr)_44px] gap-2"
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
                <SelectTrigger aria-label={`${index === 0 ? "Primary" : "Link"} action label`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {semanticLinkLabels.map((label) => (
                    <SelectItem key={label} value={label}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                aria-label={`${index === 0 ? "Primary" : `Link ${index + 1}`} URL`}
                onChange={(event) =>
                  setLinks((current) =>
                    current.map((value, linkIndex) =>
                      linkIndex === index ? { ...value, url: event.target.value } : value,
                    ),
                  )
                }
                placeholder="https://"
                type="url"
                value={link.url}
              />
              <Button
                aria-label={`Remove link ${index + 1}`}
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
                <span className="col-span-3 text-xs font-medium text-primary">Primary action</span>
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
                  <ArrowUpToLine className="size-3.5" /> Make Primary
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
            <Plus className="size-4" /> Add link
          </Button>
          {links.length ? (
            <p className="text-xs text-muted-foreground">
              The first link is the public Primary action. Remaining links appear under More links.
            </p>
          ) : null}
        </fieldset>
      ) : null}
      {type !== "note" ? (
        <div className="space-y-1.5">
          <Label htmlFor={`item-notes-${item?.id ?? dayId}-${type}`}>
            {copyLabel} notes <span className="font-normal text-muted-foreground">optional</span>
          </Label>
          <Textarea
            id={`item-notes-${item?.id ?? dayId}-${type}`}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={`Add ${copyLabel.toLowerCase()} details`}
            value={notes}
          />
        </div>
      ) : null}
    </>
  );
}
