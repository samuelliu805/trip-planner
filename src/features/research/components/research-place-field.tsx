"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { MapPin, TextCursorInput } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlaceAutocomplete } from "@/features/places/place-autocomplete";
import type { PlaceSnapshot } from "@/lib/providers/places/types";

import type { ResearchItem } from "../types";

type StoredPlace = ResearchItem["location_place"];

function toPlaceSnapshot(value?: StoredPlace | null): PlaceSnapshot | null {
  if (
    !value ||
    value.source !== "google" ||
    !value.google_place_id ||
    !value.display_name ||
    value.latitude === null ||
    value.longitude === null
  )
    return null;
  const localityKind = [
    "locality",
    "postal_town",
    "administrative_area_level_3",
    "administrative_area_level_2",
    "sublocality_level_1",
    "sublocality",
  ].includes(value.locality_kind ?? "")
    ? (value.locality_kind as Exclude<PlaceSnapshot["localityKind"], "legacy_city" | undefined>)
    : undefined;
  return {
    ...(value.administrative_area_name && {
      administrativeAreaName: value.administrative_area_name,
    }),
    ...(value.country_code && { countryCode: value.country_code }),
    displayName: value.display_name,
    ...(value.formatted_address && { formattedAddress: value.formatted_address }),
    latitude: value.latitude,
    longitude: value.longitude,
    ...(localityKind && value.locality_name
      ? { localityKind, localityName: value.locality_name }
      : {}),
    ...(value.locality_source === "google_address_component" && {
      localitySource: value.locality_source,
    }),
    provider: "google",
    providerPlaceId: value.google_place_id,
  };
}

export function ResearchPlaceField({
  initialPlace,
  initialPlaceId,
  initialText,
  includedPrimaryTypes,
  label,
  onTextChange,
  placeIdName,
  placeholder,
  snapshotName,
  textName,
}: {
  initialPlace?: StoredPlace | null;
  initialPlaceId?: string | null;
  initialText?: string | null;
  includedPrimaryTypes?: string[];
  label: string;
  onTextChange?: (value: string) => void;
  placeIdName: string;
  placeholder?: string;
  snapshotName: string;
  textName: string;
}) {
  const stored = toPlaceSnapshot(initialPlace);
  const [manual, setManual] = useState(Boolean(initialText) && !stored);
  const [place, setPlace] = useState<PlaceSnapshot | null>(stored);
  const [placeId, setPlaceId] = useState(initialPlaceId ?? "");
  const [text, setText] = useState(initialText ?? stored?.displayName ?? "");
  const labelId = useId();
  const { t } = useI18n();

  function useManualEntry() {
    setManual(true);
    setPlace(null);
    setPlaceId("");
  }

  function changeText(value: string) {
    setText(value);
    onTextChange?.(value);
  }

  return (
    <div aria-labelledby={labelId} className="block min-w-0 space-y-2" role="group">
      <Label asChild>
        <span id={labelId}>
          <Localized value={label} />
        </span>
      </Label>
      <input name={placeIdName} type="hidden" value={placeId} />
      <input name={snapshotName} type="hidden" value={place ? JSON.stringify(place) : ""} />
      <input name={textName} type="hidden" value={text} />
      {manual ? (
        <div className="flex min-w-0 gap-2">
          <Input
            aria-label={t("{label}, entered manually", { label: t(label) })}
            className="min-w-0"
            maxLength={200}
            onChange={(event) => changeText(event.target.value)}
            placeholder={t(placeholder ?? "Enter a name or area")}
            value={text}
          />
          <Button
            aria-label={t("Search Google Maps for {label}", { label: t(label) })}
            className="size-11 shrink-0 p-0"
            onClick={() => setManual(false)}
            type="button"
            variant="outline"
          >
            <MapPin aria-hidden="true" className="size-4" />
          </Button>
        </div>
      ) : (
        <div className="min-w-0 space-y-1">
          <PlaceAutocomplete
            includedPrimaryTypes={includedPrimaryTypes}
            onChange={(next) => {
              setPlace(next);
              setPlaceId("");
              changeText(next?.displayName ?? "");
            }}
            placeholder={placeholder ? t(placeholder) : undefined}
            value={place}
          />
          {!place ? (
            <Button
              className="h-11 px-2 text-muted-foreground"
              onClick={useManualEntry}
              type="button"
              variant="ghost"
            >
              <TextCursorInput aria-hidden="true" className="size-4" />{" "}
              <T message={" Enter without Maps "} />
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
