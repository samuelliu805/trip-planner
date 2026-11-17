import { aiConfig } from "@/features/ai/config";
import { privilegedAiRpc } from "@/features/ai/database.server";
import { errorResponse } from "@/features/ai/http";
import { handleMcp } from "@/features/ai/mcp";
import { configuredPlacesRunner } from "@/features/ai/places.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const config = aiConfig();
    const rpc = privilegedAiRpc();
    return await handleMcp(request, rpc, config, configuredPlacesRunner(rpc, config));
  } catch (error) {
    return errorResponse(error);
  }
}
export const GET = POST;
export const DELETE = POST;
export const OPTIONS = POST;
