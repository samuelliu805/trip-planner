import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { siteUrlFromHeaders } from "@/features/sharing/site-url";

export async function GET(request: NextRequest) {
  const siteUrl = siteUrlFromHeaders(request.headers, request.nextUrl.origin);
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/trips", siteUrl));
  }

  const source = request.nextUrl.searchParams.has("error") ? "google" : "confirmation";
  return NextResponse.redirect(new URL(`/login?error=${source}`, siteUrl));
}
