"use client";

import type { BrowserStorageProvider } from "@/platform/contracts/storage";
import { SupabaseBrowserStorageProvider } from "@/platform/supabase/browser-storage-provider";

export function getBrowserStorageProvider(bucket: string): BrowserStorageProvider {
  return new SupabaseBrowserStorageProvider(bucket);
}
