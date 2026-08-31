import { NextResponse, type NextRequest } from "next/server";

import { PlatformOperationError } from "@/platform/contracts/errors";

import {
  cloudBaseVerifiedUserHeader,
  clearCloudBaseSession,
  encodeCloudBaseVerifiedUser,
  type CloudBaseCookieStore,
  restoreCloudBaseSession,
} from "./session";

export async function updateCloudBaseSession(request: NextRequest) {
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.delete(cloudBaseVerifiedUserHeader);
  let response = NextResponse.next({ request: { headers: forwardedHeaders } });
  const pendingCookies = new Map<
    string,
    | { action: "delete" }
    | { action: "set"; options: Readonly<Record<string, unknown>>; value: string }
  >();

  function rebuildResponse() {
    response = NextResponse.next({ request: { headers: forwardedHeaders } });
    for (const [name, pending] of pendingCookies) {
      if (pending.action === "delete") response.cookies.delete(name);
      else response.cookies.set(name, pending.value, pending.options);
    }
  }

  const store: CloudBaseCookieStore = {
    delete(name) {
      request.cookies.delete(name);
      pendingCookies.set(name, { action: "delete" });
      rebuildResponse();
    },
    get: (name) => request.cookies.get(name),
    set(name, value, options) {
      request.cookies.set(name, value);
      pendingCookies.set(name, { action: "set", options, value });
      rebuildResponse();
    },
  };
  try {
    const session = await restoreCloudBaseSession(store, { persistRefreshedSession: true });
    if (session) {
      forwardedHeaders.set(cloudBaseVerifiedUserHeader, encodeCloudBaseVerifiedUser(session));
      rebuildResponse();
    }
  } catch (error) {
    if (
      error instanceof PlatformOperationError &&
      (error.code === "authentication_required" || error.code === "invalid_credentials")
    ) {
      clearCloudBaseSession(store);
    }
  }
  return response;
}
