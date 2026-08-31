import "server-only";

import { capabilitiesForRegion } from "@/platform/capabilities/backend-capabilities";
import { CloudBaseAuthProvider } from "@/platform/cloudbase/auth-provider";
import { createCloudBaseRelationalDatabase } from "@/platform/cloudbase/relational-database";
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
import type { RelationalDatabase } from "@/platform/contracts/relational";
import type { TripRepository } from "@/platform/contracts/trips";
import { SupabaseAuthProvider } from "@/platform/supabase/auth-provider";
import { createSupabaseRelationalDatabase } from "@/platform/supabase/relational-database";
import { createSupabaseAdminRelationalDatabase } from "@/platform/supabase/admin-relational-database";
import {
  getSupabaseResumableUploadEndpoint,
  SupabaseStorageProvider,
} from "@/platform/supabase/storage-provider";
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

export async function getRelationalDatabase(): Promise<RelationalDatabase> {
  const config = getServerProviderConfig();
  return config.dataProvider === "supabase"
    ? createSupabaseRelationalDatabase()
    : createCloudBaseRelationalDatabase();
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

export function getResumableUploadEndpoint(): string {
  const config = getServerProviderConfig();
  if (config.storageProvider !== "supabase" || !getBackendCapabilities().signedUrls) {
    throw new Error("This backend does not support resumable uploads.");
  }
  return getSupabaseResumableUploadEndpoint();
}

export function getPrivilegedRelationalDatabase(): RelationalDatabase {
  const config = getServerProviderConfig();
  if (config.dataProvider !== "supabase" || !getBackendCapabilities().signedUrls) {
    throw new Error("This backend does not support privileged Phase 4 data operations.");
  }
  return createSupabaseAdminRelationalDatabase();
}
