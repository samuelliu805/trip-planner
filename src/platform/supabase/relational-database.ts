import "server-only";

import type { RelationalDatabase } from "@/platform/contracts/relational";

import { createSupabaseServerClient } from "./server";

export async function createSupabaseRelationalDatabase(): Promise<RelationalDatabase> {
  return (await createSupabaseServerClient()) as unknown as RelationalDatabase;
}
