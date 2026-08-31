import "server-only";

import { cookies } from "next/headers";

import { PlatformOperationError } from "@/platform/contracts/errors";

import { createCloudBaseClients } from "./client";
import { restoreCloudBaseSession } from "./session";

export async function createCloudBaseUserContext() {
  const session = await restoreCloudBaseSession(await cookies());
  if (!session) {
    throw new PlatformOperationError("authentication_required", "Authentication is required.");
  }
  return Object.freeze({
    db: createCloudBaseClients(session.accessToken).db,
    user: session.user,
  });
}
