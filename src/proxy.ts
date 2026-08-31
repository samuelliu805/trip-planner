import type { NextRequest } from "next/server";

import {
  continueWithoutProviderSession,
  updateProviderSession,
} from "@/platform/composition/proxy";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/share/"))
    return continueWithoutProviderSession(request);
  return updateProviderSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
