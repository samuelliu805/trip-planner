import "server-only";

import { cookies, headers } from "next/headers";

import { PlatformOperationError } from "@/platform/contracts/errors";

import { readCloudBaseVerifiedCookieSession } from "./session";
import { createCloudBaseSessionDatabase } from "./session-database";

export async function createCloudBaseUserContext() {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const session = readCloudBaseVerifiedCookieSession(cookieStore, headerStore);
  if (!session) {
    throw new PlatformOperationError("authentication_required", "Authentication is required.");
  }
  return Object.freeze({
    db: createCloudBaseSessionDatabase(session),
    user: session.user,
  });
}
