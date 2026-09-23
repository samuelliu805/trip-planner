import { handleAuthorizedGooglePlacesRequest } from "@/lib/providers/google/places/google-places.server";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ tripId: string }> }) {
  return handleAuthorizedGooglePlacesRequest(request, (await context.params).tripId);
}
