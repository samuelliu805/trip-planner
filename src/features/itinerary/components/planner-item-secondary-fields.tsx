"use client";

import { Plus, Trash2, X } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  CarRentalDetails,
  ItineraryItem,
  ItineraryItemType,
} from "@/features/itinerary/types";

type LinkValue = { label: string; url: string };

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
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`item-start-${item?.id ?? dayId}-${type}`}>
              {type === "location" ? "Arrive" : "Start time"}{" "}
              <span className="font-normal text-muted-foreground">optional</span>
            </Label>
            <div className="relative">
              <Input
                className="pr-9"
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
          <div className="space-y-1.5">
            <Label htmlFor={`item-end-${item?.id ?? dayId}-${type}`}>
              {type === "location" ? "Leave" : "End time"}{" "}
              <span className="font-normal text-muted-foreground">optional</span>
            </Label>
            <div className="relative">
              <Input
                className="pr-9"
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
            <div className="flex gap-2" key={index}>
              <Input
                aria-label={`Link ${index + 1} URL`}
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
                className="size-9 p-0"
                size="sm"
                type="button"
                variant="ghost"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            onClick={() => setLinks((current) => [...current, { label: linkLabel, url: "" }])}
            size="sm"
            type="button"
            variant="outline"
          >
            <Plus className="size-4" /> Add link
          </Button>
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
