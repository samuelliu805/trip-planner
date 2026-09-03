import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { updateCloudBaseSession } from "@/platform/cloudbase/proxy";
import { cloudBaseVerifiedUserHeader } from "@/platform/cloudbase/session";

export function updateProviderSession(request: NextRequest) {
  return updateCloudBaseSession(request);
}

export function continueWithoutProviderSession(request: NextRequest) {
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.delete(cloudBaseVerifiedUserHeader);
  return NextResponse.next({ request: { headers: forwardedHeaders } });
}
