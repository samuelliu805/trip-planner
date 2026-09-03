"use client";

import type { BrowserPhoneOtpProvider } from "@/platform/contracts/auth";
import { PlatformOperationError } from "@/platform/contracts/errors";
import type { BrowserStorageProvider } from "@/platform/contracts/storage";
import { SupabaseBrowserStorageProvider } from "@/platform/supabase/browser-storage-provider";

export function getBrowserStorageProvider(bucket: string): BrowserStorageProvider {
  return new SupabaseBrowserStorageProvider(bucket);
}

export function getBrowserPhoneOtpProvider(): BrowserPhoneOtpProvider {
  throw new PlatformOperationError("provider_unavailable", "Phone sign-in is not available.");
}
