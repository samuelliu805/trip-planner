import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { updateSupabaseSession } from "@/platform/supabase/proxy";

export function updateProviderSession(request: NextRequest) {
  return updateSupabaseSession(request);
}

export function continueWithoutProviderSession(request: NextRequest) {
  return NextResponse.next({ request });
}
