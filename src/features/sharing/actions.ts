"use server";

import { revalidatePath } from "next/cache";

import { calculateGoogleRouteLeg } from "@/lib/providers/routes/google-routes.server";
import { RouteProviderError } from "@/lib/providers/routes/errors";
import { createClient } from "@/lib/supabase/server";
import { buildRouteLegSignature } from "@/features/routes/signatures";
import { mapWithConcurrency } from "@/features/routes/calculator";
import type { RouteLegMode } from "@/features/routes/types";

import { getPublicItinerary } from "./data";
import { publicDayRoutePlan, publicOverviewStops } from "./public-map-model";
import {
  linkMutationSchema,
  publicItineraryLinkSchema,
  publicItinerarySettingsSchema,
  publicOverviewRouteCalculationInputSchema,
  publicRouteCalculationInputSchema,
  publicRouteCalculationSchema,
  type PublicItinerarySettingsInput,
} from "./schema";
import type { PublicRouteCalculation, ShareActionResult } from "./types";
import { registeredPublicTemplateKey } from "./templates/registry";

type PublicCalculationStop = {
  latitude: number;
  longitude: number;
  ref: string;
};

function managementError(error?: string) {
  if (error?.includes("PUBLIC_LINK_ACTIVE_EXISTS"))
    return "This route already has an active public link.";
  if (error?.includes("PUBLIC_TEMPLATE_UNAVAILABLE"))
    return "Choose an available built-in public template.";
  if (error?.includes("PUBLIC_IMAGE_DAY_RANGE_INVALID"))
    return "Choose an image range within this trip.";
  if (error?.match(/OWNER|permission|row-level security/i))
    return "Only the trip owner can manage public links.";
  return "The public link could not be changed. Try again.";
}

const rpcSettings = (input: PublicItinerarySettingsInput) => ({
  requested_allow_long_image_download: input.allowLongImageDownload,
  requested_allow_route_explore: input.allowRouteExplore,
  requested_default_view: input.defaultView,
  requested_long_image_end_day_number: input.longImageEndDayNumber,
  requested_long_image_qr_destination: input.longImageQrDestination,
  requested_long_image_qr_share_page_id: input.longImageQrSharePageId,
  requested_long_image_start_day_number: input.longImageStartDayNumber,
  requested_share_description: input.shareDescription,
  requested_share_title: input.shareTitle,
  requested_show_addresses: input.showAddresses,
  requested_show_map_routes: input.showMapRoutes,
  requested_show_notes: input.showNotes,
  requested_show_place_photos: input.showPlacePhotos,
  requested_show_quick_action_links: input.showQuickActionLinks,
  requested_show_times: input.showTimes,
  requested_template_id: input.templateId,
  requested_template_version: input.templateVersion,
});

export async function createPublicItineraryLink(
  rawInput: PublicItinerarySettingsInput,
): Promise<ShareActionResult> {
  const parsed = publicItinerarySettingsSchema.safeParse(rawInput);
  if (
    !parsed.success ||
    !registeredPublicTemplateKey(parsed.data.templateId, parsed.data.templateVersion)
  )
    return { error: "Review the public link settings." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_share_page_v2", {
    target_variant_id: parsed.data.variantId,
    ...rpcSettings(parsed.data),
  });
  if (error) return { error: managementError(error.message) };
  const link = publicItineraryLinkSchema.safeParse(data);
  if (!link.success) return { error: "The new public link could not be read." };
  if (link.data.tripId) revalidatePath(`/trips/${link.data.tripId}`);
  return { data: link.data };
}

export async function updatePublicItineraryLink(
  linkId: string,
  rawInput: PublicItinerarySettingsInput,
): Promise<ShareActionResult> {
  const settings = publicItinerarySettingsSchema.safeParse(rawInput);
  if (
    !settings.success ||
    !registeredPublicTemplateKey(settings.data.templateId, settings.data.templateVersion)
  )
    return { error: "Review the public link settings." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_share_page_v2", {
    target_share_page_id: linkId,
    ...rpcSettings(settings.data),
  });
  if (error) return { error: managementError(error.message) };
  const link = publicItineraryLinkSchema.safeParse(data);
  if (!link.success) return { error: "The saved public link could not be read." };
  if (link.data.tripId) revalidatePath(`/trips/${link.data.tripId}`);
  return { data: link.data };
}

export async function revokePublicItineraryLink(rawInput: {
  linkId: string;
  tripId: string;
}): Promise<ShareActionResult<null>> {
  const input = linkMutationSchema.safeParse(rawInput);
  if (!input.success) return { error: "The public link request is invalid." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_share_page_v1", {
    target_share_page_id: input.data.linkId,
  });
  if (error) return { error: managementError(error.message) };
  revalidatePath(`/trips/${input.data.tripId}`);
  return { data: null };
}

async function calculatePublicStops({
  legModes,
  signatureScope,
  stops,
}: {
  legModes: RouteLegMode[];
  signatureScope: string;
  stops: PublicCalculationStop[];
}): Promise<ShareActionResult<PublicRouteCalculation>> {
  try {
    const tasks = legModes.map((mode, index) => {
      const origin = stops[index];
      const destination = stops[index + 1];
      const originCoordinates = { latitude: origin.latitude, longitude: origin.longitude };
      const destinationCoordinates = {
        latitude: destination.latitude,
        longitude: destination.longitude,
      };
      const legSignature = buildRouteLegSignature(
        { dayId: signatureScope, tripId: "public", variantId: "public" },
        index + 1,
        { coordinates: originCoordinates, itemId: origin.ref },
        { coordinates: destinationCoordinates, itemId: destination.ref },
        mode,
      );
      return () =>
        calculateGoogleRouteLeg({
          destination: destinationCoordinates,
          legSignature,
          mode,
          origin: originCoordinates,
          position: index + 1,
        });
    });
    const calculated = await mapWithConcurrency(tasks, 3);
    const safeResult = {
      legs: calculated.map((leg) => ({
        distanceMeters: leg.distanceMeters,
        durationSeconds: leg.durationSeconds,
        geometry: leg.geometry,
        mode: leg.mode,
        position: leg.position,
      })),
      totalDistanceMeters: calculated.reduce((total, leg) => total + leg.distanceMeters, 0),
      totalDurationSeconds: calculated.every((leg) => leg.durationSeconds !== null)
        ? calculated.reduce((total, leg) => total + (leg.durationSeconds ?? 0), 0)
        : null,
    };
    const parsed = publicRouteCalculationSchema.safeParse(safeResult);
    return parsed.success ? { data: parsed.data } : { error: "Route unavailable. Try again." };
  } catch (error) {
    if (error instanceof RouteProviderError) return { error: error.message };
    return { error: "Route unavailable. Keep the stop sequence and try again." };
  }
}

export async function calculatePublicOverviewRoute(
  rawInput: unknown,
): Promise<ShareActionResult<PublicRouteCalculation>> {
  const input = publicOverviewRouteCalculationInputSchema.safeParse(rawInput);
  if (!input.success)
    return { error: input.error.issues[0]?.message ?? "Review the whole-trip route." };

  const itinerary = await getPublicItinerary(input.data.token);
  if (!itinerary?.settings.allowRouteExplore)
    return { error: "Route exploration is unavailable for this itinerary." };
  const sharedStops = publicOverviewStops(itinerary);
  if (
    sharedStops.length !== input.data.stopRefs.length ||
    sharedStops.some(({ ref }, index) => ref !== input.data.stopRefs[index])
  )
    return { error: "The shared stage route changed. Refresh and try again." };

  return calculatePublicStops({
    legModes: input.data.legModes,
    signatureScope: "public-overview",
    stops: sharedStops.map(({ latitude, longitude, ref }) => ({ latitude, longitude, ref })),
  });
}

export async function calculatePublicRoute(
  rawInput: unknown,
): Promise<ShareActionResult<PublicRouteCalculation>> {
  const input = publicRouteCalculationInputSchema.safeParse(rawInput);
  if (!input.success)
    return { error: input.error.issues[0]?.message ?? "Review the temporary route." };

  const itinerary = await getPublicItinerary(input.data.token);
  if (!itinerary?.settings.allowRouteExplore)
    return { error: "Route exploration is unavailable for this itinerary." };
  const day = itinerary.days.find(({ ref }) => ref === input.data.dayRef);
  if (!day) return { error: "The shared route changed. Refresh and try again." };

  const routePlan = publicDayRoutePlan(itinerary, day.ref);
  const candidates = new Map(routePlan.items.map((item) => [item.ref, item]));
  const stops = input.data.stopRefs.map((ref) => candidates.get(ref));
  if (stops.some((stop) => !stop?.place))
    return { error: "Temporary routes can use only shared itinerary stops." };
  if (routePlan.startRef && input.data.stopRefs[0] !== routePlan.startRef)
    return { error: "This day route must start at the previous day Hotel." };
  if (routePlan.endRef && input.data.stopRefs.at(-1) !== routePlan.endRef)
    return { error: "This day route must end at the current day Hotel." };

  return calculatePublicStops({
    legModes: input.data.legModes,
    signatureScope: day.ref,
    stops: stops.map((stop) => ({
      latitude: stop!.place!.latitude!,
      longitude: stop!.place!.longitude!,
      ref: stop!.ref,
    })),
  });
}
