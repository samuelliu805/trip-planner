import { createClient } from "@supabase/supabase-js";

import {
  resolveGooglePlaceLocality,
  type GoogleAddressComponent,
} from "../src/lib/providers/google/places/normalize-google-place.ts";

const applyChanges = process.argv.includes("--apply");
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--apply");
if (unknownArguments.length) throw new Error(`Unknown argument: ${unknownArguments.join(", ")}`);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const googlePlacesApiKey = process.env.GOOGLE_PLACES_API_KEY;
if (!supabaseUrl || !supabaseSecretKey || !googlePlacesApiKey)
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, and GOOGLE_PLACES_API_KEY are required.",
  );
const googlePlacesKey = googlePlacesApiKey;

const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const localityItemTypes = ["activity", "meal", "car_rental", "hotel"];
const pageSize = 1_000;

async function referencedPlaceIds() {
  const ids = new Set<string>();
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("itinerary_items")
      .select("place_id")
      .in("type", localityItemTypes)
      .not("place_id", "is", null)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    for (const row of data) if (row.place_id) ids.add(row.place_id);
    if (data.length < pageSize) break;
  }
  return [...ids];
}

async function unresolvedPlaces(ids: string[]) {
  const places: Array<{ google_place_id: string; id: string }> = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await supabase
      .from("places")
      .select("id, google_place_id")
      .in("id", ids.slice(offset, offset + 100))
      .eq("source", "google")
      .is("locality_name", null)
      .not("google_place_id", "is", null);
    if (error) throw error;
    for (const place of data)
      if (place.google_place_id) places.push({ ...place, google_place_id: place.google_place_id });
  }
  return places;
}

async function fetchAddressComponents(providerPlaceId: string) {
  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(providerPlaceId)}`,
    {
      headers: {
        "X-Goog-Api-Key": googlePlacesKey,
        "X-Goog-FieldMask": "addressComponents",
      },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) throw new Error(`Google Place Details returned HTTP ${response.status}.`);
  const payload = (await response.json()) as {
    addressComponents?: GoogleAddressComponent[];
  };
  return resolveGooglePlaceLocality(payload.addressComponents ?? []);
}

const placeIds = await referencedPlaceIds();
const places = await unresolvedPlaces(placeIds);
const providerIds = [...new Set(places.map((place) => place.google_place_id))];
const resolved = new Map<string, Awaited<ReturnType<typeof fetchAddressComponents>>>();
const failures: unknown[] = [];
let cursor = 0;

async function lookupWorker() {
  while (cursor < providerIds.length) {
    const providerPlaceId = providerIds[cursor++];
    try {
      resolved.set(providerPlaceId, await fetchAddressComponents(providerPlaceId));
    } catch (error) {
      failures.push(error);
    }
  }
}

await Promise.all(Array.from({ length: Math.min(5, providerIds.length) }, () => lookupWorker()));
if (failures.length)
  throw new Error(`Google Place Details failed for ${failures.length} place(s); no rows changed.`);

const updates = places.flatMap((place) => {
  const locality = resolved.get(place.google_place_id);
  return locality?.localityName && locality.localityKind && locality.localitySource
    ? [{ id: place.id, locality }]
    : [];
});
const skipped = places.length - updates.length;

if (!applyChanges) {
  console.log(
    `Dry run: ${updates.length} place row(s) can be backfilled${skipped ? `; ${skipped} have no supported locality component` : ""}.`,
  );
  console.log("Run with --apply to persist these structured Google address components.");
  process.exit(0);
}

let updated = 0;
for (const { id, locality } of updates) {
  const { data, error } = await supabase
    .from("places")
    .update({
      administrative_area_name: locality.administrativeAreaName ?? null,
      country_code: locality.countryCode ?? null,
      locality_kind: locality.localityKind,
      locality_name: locality.localityName,
      locality_source: locality.localitySource,
    })
    .eq("id", id)
    .is("locality_name", null)
    .select("id");
  if (error) throw error;
  updated += data.length;
}

console.log(
  `Backfilled ${updated} place row(s) from typed Google address components${skipped ? `; ${skipped} could not be resolved` : ""}.`,
);
