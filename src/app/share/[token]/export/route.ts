import { getPublicItinerary } from "@/features/sharing/data";
import { itineraryExportResponse } from "@/features/sharing/itinerary-export-response";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  return itineraryExportResponse(request, (await params).token, getPublicItinerary);
}
