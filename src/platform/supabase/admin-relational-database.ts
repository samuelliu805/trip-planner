import "server-only";

import type { RelationalDatabase } from "@/platform/contracts/relational";

import { createSupabaseAdminClient } from "./admin";

export function createSupabaseAdminRelationalDatabase(): RelationalDatabase {
  return createSupabaseAdminClient() as unknown as RelationalDatabase;
}
