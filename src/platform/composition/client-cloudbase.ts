"use client";

import { CloudBaseBrowserStorageProvider } from "@/platform/cloudbase/browser-storage-provider";
import type { BrowserStorageProvider } from "@/platform/contracts/storage";

export function getBrowserStorageProvider(bucket: string): BrowserStorageProvider {
  return new CloudBaseBrowserStorageProvider(bucket);
}
