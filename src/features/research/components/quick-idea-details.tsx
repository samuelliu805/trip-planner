"use client";

import type { PlaceSnapshot } from "@/lib/providers/places/types";

import type { IdeaClassification } from "../idea-input";
import type { IdeaPageMetadata } from "../idea-page-metadata";
import { ideaPlaceQuery } from "../idea-place-query";
import type { IdeaUrlFields } from "../idea-url-fields";
import { formatMoney } from "../money";
import { IdeaLinkPreview } from "./idea-link-preview";
import { QuickIdeaPlaceConfirmation } from "./quick-idea-place-confirmation";

export function QuickIdeaDetails({
  candidateLocation,
  classification,
  destinationPlace,
  metadata,
  onDestinationPlaceChange,
  onMetadata,
  onOriginPlaceChange,
  onPlaceChange,
  originPlace,
  place,
  preview,
  providerTitle,
  route,
}: {
  candidateLocation: string | null;
  classification: IdeaClassification;
  destinationPlace: PlaceSnapshot | null;
  metadata: IdeaPageMetadata | null;
  onDestinationPlaceChange: (place: PlaceSnapshot | null) => void;
  onMetadata: (metadata: IdeaPageMetadata | null) => void;
  onOriginPlaceChange: (place: PlaceSnapshot | null) => void;
  onPlaceChange: (place: PlaceSnapshot | null) => void;
  originPlace: PlaceSnapshot | null;
  place: PlaceSnapshot | null;
  preview: IdeaUrlFields;
  providerTitle: string | null;
  route: string | null;
}) {
  const priceAmount = preview.priceAmount ?? metadata?.priceAmount ?? null;
  const priceCurrency = preview.priceCurrency ?? metadata?.priceCurrency ?? null;
  const services = preview.segments
    ?.map((segment) => [segment.carrier, segment.serviceNumber].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {route || candidateLocation || preview.startDate || priceAmount !== null ? (
        <p className="flex flex-wrap gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {route || candidateLocation ? <span>{route || candidateLocation}</span> : null}
          {preview.startDate ? (
            <span>
              {preview.endDate ? `${preview.startDate} – ${preview.endDate}` : preview.startDate}
            </span>
          ) : null}
          {services ? <span>{services}</span> : null}
          {priceAmount !== null && priceCurrency ? (
            <strong className="text-foreground">{formatMoney(priceAmount, priceCurrency)}</strong>
          ) : null}
        </p>
      ) : null}
      <IdeaLinkPreview
        hasReliableFields={Boolean(
          (route || candidateLocation) && preview.startDate && priceAmount !== null,
        )}
        key={classification.sourceUrl ?? ""}
        onResult={onMetadata}
        sourceUrl={classification.sourceUrl}
      />
      {(classification.kind === "stay" || classification.kind === "activity") &&
      candidateLocation ? (
        <QuickIdeaPlaceConfirmation
          candidate={ideaPlaceQuery(metadata?.title ?? providerTitle, candidateLocation)}
          onChange={onPlaceChange}
          sourceKey={classification.sourceUrl ?? "manual"}
          value={place}
        />
      ) : null}
      {classification.kind === "car" && preview.originText ? (
        <QuickIdeaPlaceConfirmation
          candidate={ideaPlaceQuery(classification.provider, preview.originText)}
          label="Pick-up location"
          onChange={onOriginPlaceChange}
          sourceKey={`${classification.sourceUrl ?? "manual"}:pickup`}
          value={originPlace}
        />
      ) : null}
      {classification.kind === "car" &&
      preview.destinationText &&
      preview.destinationText !== preview.originText ? (
        <QuickIdeaPlaceConfirmation
          candidate={ideaPlaceQuery(classification.provider, preview.destinationText)}
          label="Return location"
          onChange={onDestinationPlaceChange}
          sourceKey={`${classification.sourceUrl ?? "manual"}:return`}
          value={destinationPlace}
        />
      ) : null}
    </>
  );
}
