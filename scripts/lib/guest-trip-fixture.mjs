import { randomUUID } from "node:crypto";

export function createGuestTripFixture(region, label) {
  const timestamp = "2026-09-05T12:00:00.000Z";
  const draftId = randomUUID();
  const variantId = randomUUID();
  const dayId = randomUUID();
  const itemId = randomUUID();
  const duplicateItemId = randomUUID();
  const linkId = randomUUID();
  const placeId = randomUUID();
  const duplicatePlaceId = randomUUID();
  const provider = region === "cn" ? "amap" : "google";
  const providerPlaceId = `${provider}-${label}`;
  const title = `${label} guest trip`;
  const place = {
    coordinateSystem: "wgs84",
    countryCode: region === "cn" ? "CN" : "US",
    displayName: `${label} place`,
    formattedAddress: `${label} address`,
    id: placeId,
    latitude: region === "cn" ? 31.2304 : 37.7749,
    localityKind: "locality",
    localityName: region === "cn" ? "Shanghai" : "San Francisco",
    localitySource: region === "cn" ? "amap_poi" : "google_address_component",
    longitude: region === "cn" ? 121.4737 : -122.4194,
    provider,
    providerPlaceId,
  };
  const item = {
    attachments: [],
    booking_url: "https://example.com/booking",
    created_at: timestamp,
    day_id: dayId,
    details: { fixture: true },
    end_time: null,
    id: itemId,
    links: [
      {
        id: linkId,
        item_id: itemId,
        label: "Details",
        sort_order: 0,
        url: "https://example.com/details",
      },
    ],
    notes: "Guest import fixture",
    place,
    place_id: placeId,
    price_amount: 42.5,
    price_currency: region === "cn" ? "CNY" : "USD",
    schedule_kind: "none",
    schedule_text: null,
    sort_order: 0,
    start_time: null,
    title: `${label} activity`,
    trip_id: draftId,
    type: "activity",
    updated_at: timestamp,
    variant_id: variantId,
  };
  return {
    dayId,
    draftId,
    duplicateItemId,
    duplicatePlaceId,
    itemId,
    linkId,
    payload: {
      createdAt: timestamp,
      draftId,
      region,
      revision: 3,
      schemaVersion: 1,
      trip: {
        created_at: timestamp,
        currency: region === "cn" ? "CNY" : "USD",
        day_count: 1,
        end_date: "2026-09-05",
        id: draftId,
        owner_id: "guest",
        start_date: "2026-09-05",
        status: "open",
        timezone: region === "cn" ? "Asia/Shanghai" : "America/Los_Angeles",
        title,
        updated_at: timestamp,
      },
      updatedAt: timestamp,
      workspace: {
        days: [
          {
            date: "2026-09-05",
            day_number: 1,
            id: dayId,
            items: [
              item,
              {
                ...item,
                booking_url: null,
                id: duplicateItemId,
                links: [],
                notes: "Repeated provider place fixture",
                place: { ...place, id: duplicatePlaceId },
                place_id: duplicatePlaceId,
                price_amount: null,
                price_currency: null,
                sort_order: 1,
                title: `${label} repeated activity`,
              },
            ],
            notes: "Guest day note",
            title: "Arrival",
            variant_id: variantId,
          },
        ],
        routePlans: [],
        variant: {
          color: "#2563eb",
          id: variantId,
          is_primary: true,
          name: "Main plan",
          trip_id: draftId,
        },
      },
    },
    placeId,
    provider,
    providerPlaceId,
    title,
    variantId,
  };
}
