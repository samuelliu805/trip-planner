import "server-only";

import { capabilitiesForEnvironment } from "@/platform/capabilities/backend-capabilities";
import { CloudBaseAuthProvider } from "@/platform/cloudbase/auth-provider";
import { createCloudBaseAdminClients } from "@/platform/cloudbase/client";
import { CloudBasePhoneOtpAuthProvider } from "@/platform/cloudbase/phone-otp-auth-provider";
import { CloudBaseAccountProfileRepository } from "@/platform/cloudbase/profile-repository";
import {
  createCloudBasePublicRelationalDatabase,
  createCloudBaseRelationalDatabase,
} from "@/platform/cloudbase/relational-database";
import { CloudBaseStorageProvider } from "@/platform/cloudbase/storage-provider";
import { CloudBaseTripRepository } from "@/platform/cloudbase/trip-repository";
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

import { providerOperationUnavailable } from "./unavailable";

export function getBackendCapabilities() {
  return capabilitiesForEnvironment("cn", {
    CLOUDBASE_CI_PASSWORD_AUTH_ENABLED: process.env.CLOUDBASE_CI_PASSWORD_AUTH_ENABLED,
    CN_PUBLIC_PHONE_AUTH_ENABLED: process.env.CN_PUBLIC_PHONE_AUTH_ENABLED,
  });
}

export function getAuthProvider(): AuthProvider {
  return new CloudBaseAuthProvider();
}

export function getPublicSelfRegistrationProvider(): PublicSelfRegistrationProvider {
  return providerOperationUnavailable();
}

export function getRedirectOAuthProvider(): RedirectOAuthProvider {
  return providerOperationUnavailable();
}

export function getAuthorizationCodeExchangeProvider(): AuthorizationCodeExchangeProvider {
  return providerOperationUnavailable();
}

export function getPhoneOtpAuthProvider(): PhoneOtpAuthProvider {
  return new CloudBasePhoneOtpAuthProvider();
}

export function getTripRepository(): TripRepository {
  return new CloudBaseTripRepository();
}

export async function getRelationalDatabase(): Promise<RelationalDatabase> {
  return createCloudBaseRelationalDatabase();
}

export async function getPublicRelationalDatabase(): Promise<RelationalDatabase> {
  return createCloudBasePublicRelationalDatabase();
}

export function getAccountProfileRepository(): AccountProfileRepository {
  return new CloudBaseAccountProfileRepository();
}

export function getStorageProvider(bucket: string): StorageProvider {
  return new CloudBaseStorageProvider(bucket);
}

export function getResumableUploadEndpoint(): string | null {
  return null;
}

export function getPrivilegedRelationalDatabase(): RelationalDatabase {
  return createCloudBaseAdminClients().rdb() as unknown as RelationalDatabase;
}
