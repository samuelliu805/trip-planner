import "server-only";

import { capabilitiesForRegion } from "@/platform/capabilities/backend-capabilities";
import type {
  AuthProvider,
  AuthorizationCodeExchangeProvider,
  PhoneOtpAuthProvider,
  PublicSelfRegistrationProvider,
  RedirectOAuthProvider,
} from "@/platform/contracts/auth";
import type { AccountProfileRepository } from "@/platform/contracts/profile";
import type { RelationalDatabase } from "@/platform/contracts/relational";
import type { StorageProvider } from "@/platform/contracts/storage";
import type { TripRepository } from "@/platform/contracts/trips";
import { SupabaseAuthProvider } from "@/platform/supabase/auth-provider";
import { createSupabaseAdminRelationalDatabase } from "@/platform/supabase/admin-relational-database";
import { SupabaseAccountProfileRepository } from "@/platform/supabase/profile-repository";
import { createSupabaseRelationalDatabase } from "@/platform/supabase/relational-database";
import {
  getSupabaseResumableUploadEndpoint,
  SupabaseStorageProvider,
} from "@/platform/supabase/storage-provider";
import { SupabaseTripRepository } from "@/platform/supabase/trip-repository";

import { providerOperationUnavailable } from "./unavailable";

export function getBackendCapabilities() {
  return capabilitiesForRegion("global");
}

export function getAuthProvider(): AuthProvider {
  return new SupabaseAuthProvider();
}

export function getPublicSelfRegistrationProvider(): PublicSelfRegistrationProvider {
  return new SupabaseAuthProvider();
}

export function getRedirectOAuthProvider(): RedirectOAuthProvider {
  return new SupabaseAuthProvider();
}

export function getAuthorizationCodeExchangeProvider(): AuthorizationCodeExchangeProvider {
  return new SupabaseAuthProvider();
}

export function getPhoneOtpAuthProvider(): PhoneOtpAuthProvider {
  return providerOperationUnavailable();
}

export function getTripRepository(): TripRepository {
  return new SupabaseTripRepository();
}

export async function getRelationalDatabase(): Promise<RelationalDatabase> {
  return createSupabaseRelationalDatabase();
}

export async function getPublicRelationalDatabase(): Promise<RelationalDatabase> {
  return createSupabaseRelationalDatabase();
}

export function getAccountProfileRepository(): AccountProfileRepository {
  return new SupabaseAccountProfileRepository();
}

export function getStorageProvider(bucket: string): StorageProvider {
  return new SupabaseStorageProvider(bucket);
}

export function getResumableUploadEndpoint(): string | null {
  return getSupabaseResumableUploadEndpoint();
}

export function getPrivilegedRelationalDatabase(): RelationalDatabase {
  return createSupabaseAdminRelationalDatabase();
}
