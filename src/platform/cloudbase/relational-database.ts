import "server-only";

import type { RelationalDatabase } from "@/platform/contracts/relational";

import { createCloudBaseUserContext } from "./database";

export async function createCloudBaseRelationalDatabase(): Promise<RelationalDatabase> {
  const { db } = await createCloudBaseUserContext();
  return db as unknown as RelationalDatabase;
}
