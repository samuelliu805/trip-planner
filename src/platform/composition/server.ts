import "server-only";

import { capabilitiesForRegion } from "@/platform/capabilities/backend-capabilities";
import { CloudBaseAuthProvider } from "@/platform/cloudbase/auth-provider";
import { CloudBaseTripRepository } from "@/platform/cloudbase/trip-repository";
import { CloudBaseAccountProfileRepository } from "@/platform/cloudbase/profile-repository";
import { cloudBaseProviderUnavailable } from "@/platform/cloudbase/unavailable";
import { getServerProviderConfig } from "@/platform/config/server";
import type {
  AuthProvider,
  AuthorizationCodeExchangeProvider,
  PublicSelfRegistrationProvider,
  RedirectOAuthProvider,
} from "@/platform/contracts/auth";
import type { StorageProvider } from "@/platform/contracts/storage";
import type { AccountProfileRepository } from "@/platform/contracts/profile";
import type { TripRepository } from "@/platform/contracts/trips";
import { SupabaseAuthProvider } from "@/platform/supabase/auth-provider";
import { SupabaseStorageProvider } from "@/platform/supabase/storage-provider";
import { SupabaseAccountProfileRepository } from "@/platform/supabase/profile-repository";
import { SupabaseTripRepository } from "@/platform/supabase/trip-repository";

export function getBackendCapabilities() {
  return capabilitiesForRegion(getServerProviderConfig().appRegion);
}

export function getAuthProvider(): AuthProvider {
  const config = getServerProviderConfig();
  if (config.authProvider === "supabase") return new SupabaseAuthProvider();
  return new CloudBaseAuthProvider();
}

export function getPublicSelfRegistrationProvider(): PublicSelfRegistrationProvider {
  const config = getServerProviderConfig();
  if (config.authProvider === "supabase") return new SupabaseAuthProvider();
  return cloudBaseProviderUnavailable();
}

export function getRedirectOAuthProvider(): RedirectOAuthProvider {
  const config = getServerProviderConfig();
  if (config.authProvider === "supabase") return new SupabaseAuthProvider();
  return cloudBaseProviderUnavailable();
}

export function getAuthorizationCodeExchangeProvider(): AuthorizationCodeExchangeProvider {
  const config = getServerProviderConfig();
  if (config.authProvider === "supabase") return new SupabaseAuthProvider();
  return cloudBaseProviderUnavailable();
}

export function getTripRepository(): TripRepository {
  const config = getServerProviderConfig();
  if (config.dataProvider === "supabase") return new SupabaseTripRepository();
  return new CloudBaseTripRepository();
}

export function getAccountProfileRepository(): AccountProfileRepository {
  const config = getServerProviderConfig();
  return config.dataProvider === "supabase"
    ? new SupabaseAccountProfileRepository()
    : new CloudBaseAccountProfileRepository();
}

export function getStorageProvider(bucket: string): StorageProvider {
  const config = getServerProviderConfig();
  if (config.storageProvider === "supabase") return new SupabaseStorageProvider(bucket);
  return cloudBaseProviderUnavailable();
}
