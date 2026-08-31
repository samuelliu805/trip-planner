"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

import { getSupabaseConfig } from "./config";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createSupabaseBrowserClient() {
  if (browserClient) return browserClient;
  const { publishableKey, url } = getSupabaseConfig();
  browserClient = createBrowserClient<Database>(url, publishableKey);
  return browserClient;
}
