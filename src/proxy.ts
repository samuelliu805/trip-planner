import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { updateCloudBaseSession } from "@/platform/cloudbase/proxy";
import { getServerProviderConfig } from "@/platform/config/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/share/")) return NextResponse.next();
  return getServerProviderConfig().authProvider === "supabase"
    ? updateSession(request)
    : updateCloudBaseSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
