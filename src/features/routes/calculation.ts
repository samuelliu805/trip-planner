import type { RouteProvider, RouteRequest, RouteResult } from "@/lib/providers/routes/types";

export async function calculateWithCache(input: {
  cached?: (RouteResult & { waypointSignature: string }) | null;
  provider: RouteProvider;
  request: RouteRequest;
  signature: string;
}) {
  if (input.cached?.waypointSignature === input.signature)
    return { cacheHit: true as const, result: input.cached };
  const result = await input.provider.calculate(input.request);
  return { cacheHit: false as const, result };
}
