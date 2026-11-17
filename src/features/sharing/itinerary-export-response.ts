import { z } from "zod";

import { serializePublicItinerary } from "./itinerary-export.ts";
import type { PublicItinerary } from "./types";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

export async function itineraryExportResponse(
  request: Request,
  token: string,
  loadItinerary: (token: string) => Promise<PublicItinerary | null>,
) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "json";
  const error = (message: string, status: number) =>
    Response.json({ error: message }, { headers, status });
  if (!z.uuid().safeParse(token).success) return error("Itinerary unavailable.", 404);
  if (format !== "json" && format !== "csv") return error("Supported formats: json, csv.", 400);
  try {
    const itinerary = await loadItinerary(token);
    if (!itinerary) return error("Itinerary unavailable.", 404);
    return new Response(serializePublicItinerary(itinerary, format), {
      headers: {
        ...headers,
        "Content-Disposition": `${url.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="itinerary.${format}"`,
        "Content-Type":
          format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
      },
    });
  } catch {
    return error("Itinerary export temporarily unavailable.", 503);
  }
}
