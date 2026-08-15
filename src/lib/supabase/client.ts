"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/types/database";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createClient() {
  if (browserClient) return browserClient;
  const { publishableKey, url } = getSupabaseConfig();
  browserClient = createBrowserClient<Database>(url, publishableKey);
  return browserClient;
}
