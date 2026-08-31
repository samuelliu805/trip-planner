"use client";

import type { BrowserStorageProvider } from "@/platform/contracts/storage";
import { SupabaseBrowserStorageProvider } from "@/platform/supabase/browser-storage-provider";

/**
 * Browser storage is a Global-only Phase 4 capability. CN never renders its
 * consumers because the server capability gate fails closed first.
 */
export function getBrowserStorageProvider(bucket: string): BrowserStorageProvider {
  return new SupabaseBrowserStorageProvider(bucket);
}
