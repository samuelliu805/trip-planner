"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/types/database";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createClient() {
  const { url, publishableKey } = getSupabaseConfig();
  client ??= createBrowserClient<Database>(url, publishableKey);
  return client;
}
