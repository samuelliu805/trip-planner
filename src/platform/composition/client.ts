"use client";

import type { BrowserStorageProvider } from "@/platform/contracts/storage";
import { CloudBaseBrowserStorageProvider } from "@/platform/cloudbase/browser-storage-provider";
import { SupabaseBrowserStorageProvider } from "@/platform/supabase/browser-storage-provider";

export function getBrowserStorageProvider(bucket: string): BrowserStorageProvider {
  return process.env.NEXT_PUBLIC_APP_REGION === "cn"
    ? new CloudBaseBrowserStorageProvider(bucket)
    : new SupabaseBrowserStorageProvider(bucket);
}
