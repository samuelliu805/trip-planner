import "server-only";

import type { CloudBaseDatabase } from "./client";
import { createCloudBaseDatabase } from "./client";

export function createCloudBaseSessionDatabase(stored: { accessToken: string }): CloudBaseDatabase {
  return createCloudBaseDatabase(stored.accessToken);
}
