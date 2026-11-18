import { NextResponse } from "next/server";
import { regionalConfig } from "@/features/ai/regional-config";

export async function GET(request: Request) {
  const state = new URL(request.url).searchParams.get("state") ?? "";
  if (process.env.APP_REGION !== "cn" || !/^[A-Za-z0-9_-]{43}$/.test(state))
    return new Response(null, { status: 400 });
  const response = NextResponse.redirect(`${regionalConfig().cnOrigin}/login`);
  response.cookies.set("trip_ai_region_login", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });
  return response;
}
