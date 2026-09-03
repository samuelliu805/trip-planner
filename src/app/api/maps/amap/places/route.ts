import { handleAmapPlacesRequestFromEnvironment } from "@/lib/providers/amap/places/amap-places.server";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleAmapPlacesRequestFromEnvironment(request);
}
