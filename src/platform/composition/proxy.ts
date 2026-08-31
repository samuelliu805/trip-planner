import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { cloudBaseVerifiedUserHeader } from "@/platform/cloudbase/session";
import { updateCloudBaseSession } from "@/platform/cloudbase/proxy";
import { getServerProviderConfig } from "@/platform/config/server";
import { updateSupabaseSession } from "@/platform/supabase/proxy";

export function updateProviderSession(request: NextRequest) {
  return getServerProviderConfig().authProvider === "supabase"
    ? updateSupabaseSession(request)
    : updateCloudBaseSession(request);
}

export function continueWithoutProviderSession(request: NextRequest) {
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.delete(cloudBaseVerifiedUserHeader);
  return NextResponse.next({ request: { headers: forwardedHeaders } });
}
