import "server-only";

import { capabilitiesForRegion } from "@/platform/capabilities/backend-capabilities";
import { cloudBaseProviderUnavailable } from "@/platform/cloudbase/unavailable";
import { getServerProviderConfig } from "@/platform/config/server";
import type { AuthProvider } from "@/platform/contracts/auth";
import type { StorageProvider } from "@/platform/contracts/storage";
import type { TripRepository } from "@/platform/contracts/trips";
import { SupabaseAuthProvider } from "@/platform/supabase/auth-provider";
import { SupabaseStorageProvider } from "@/platform/supabase/storage-provider";
import { SupabaseTripRepository } from "@/platform/supabase/trip-repository";

export function getBackendCapabilities() {
  return capabilitiesForRegion(getServerProviderConfig().appRegion);
}

export function getAuthProvider(): AuthProvider {
  const config = getServerProviderConfig();
  if (config.authProvider === "supabase") return new SupabaseAuthProvider();
  return cloudBaseProviderUnavailable();
}

export function getTripRepository(): TripRepository {
  const config = getServerProviderConfig();
  if (config.dataProvider === "supabase") return new SupabaseTripRepository();
  return cloudBaseProviderUnavailable();
}

export function getStorageProvider(bucket: string): StorageProvider {
  const config = getServerProviderConfig();
  if (config.storageProvider === "supabase") return new SupabaseStorageProvider(bucket);
  return cloudBaseProviderUnavailable();
}
