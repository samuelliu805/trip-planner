import "server-only";

import cloudbase from "@cloudbase/js-sdk";
import nodeAdapter from "@cloudbase/adapter-node";
import type { StorageClient } from "@cloudbase/js-sdk/storage";

import { PlatformOperationError } from "@/platform/contracts/errors";

import { getCloudBaseAdminConfig, getCloudBaseConfig } from "./config";

export type CloudBaseSdkResult<T = unknown> = Promise<{
  data: T | null;
  error: unknown | null;
}>;

export type CloudBaseAuthClient = Readonly<{
  getVerification(input: {
    phone_number: string;
  }): Promise<{ is_user?: boolean; verification_id?: string }>;
  getSession(): CloudBaseSdkResult;
  refreshSession(refreshToken?: string): CloudBaseSdkResult;
  setSession(input: { access_token: string; refresh_token: string }): CloudBaseSdkResult;
  signInWithPassword(input: { password: string; username: string }): CloudBaseSdkResult;
  signInWithSms(input: {
    phoneNum: string;
    verificationCode: string;
    verificationInfo: { is_user: boolean; verification_id: string };
  }): Promise<unknown>;
  signUp(input: {
    locale: string;
    phone_number: string;
    verification_code: string;
    verification_token: string;
  }): Promise<unknown>;
  signOut(): Promise<unknown>;
  verify(input: {
    verification_code: string;
    verification_id: string;
  }): Promise<{ verification_token?: string }>;
}>;

export type CloudBaseQuery = PromiseLike<{ data: unknown; error: unknown }> & {
  delete(): CloudBaseQuery;
  eq(column: string, value: unknown): CloudBaseQuery;
  insert(values: Readonly<Record<string, unknown>>): CloudBaseQuery;
  select(columns?: string): CloudBaseQuery;
  update(values: Readonly<Record<string, unknown>>): CloudBaseQuery;
  upsert(
    values: Readonly<Record<string, unknown>>,
    options?: Readonly<{ onConflict?: string }>,
  ): CloudBaseQuery;
};

export type CloudBaseDatabase = Readonly<{
  from(table: string): CloudBaseQuery;
  rpc(name: string, parameters: Readonly<Record<string, unknown>>): CloudBaseSdkResult;
}>;

let adaptersRegistered = false;
let clients: ReturnType<typeof initializeCloudBaseClients> | undefined;
let adminClients: ReturnType<typeof initializeCloudBaseAdminClients> | undefined;
let publicDatabase: CloudBaseDatabase | undefined;

function registerAdapter() {
  if (adaptersRegistered) return;
  if ((cloudbase as typeof cloudbase & { version?: string }).version !== "3.9.0") {
    throw new PlatformOperationError(
      "provider_unavailable",
      "The CloudBase runtime version does not match the validated adapter version.",
    );
  }
  cloudbase.useAdapters(nodeAdapter);
  adaptersRegistered = true;
}

function initializeCloudBaseClients() {
  registerAdapter();
  const config = getCloudBaseConfig();
  const app = cloudbase.init({
    accessKey: config.publishableKey,
    auth: { detectSessionInUrl: false },
    env: config.env,
    persistence: "none",
    region: config.region,
  });
  return {
    auth: app.auth as unknown as CloudBaseAuthClient,
    rdb: () => app.rdb() as unknown as CloudBaseDatabase,
  };
}

function initializeCloudBaseAdminClients() {
  registerAdapter();
  const config = getCloudBaseAdminConfig();
  const app = cloudbase.init({
    accessKey: config.apiKey,
    auth: { detectSessionInUrl: false },
    env: config.env,
    persistence: "none",
    region: config.region,
  });
  return {
    rdb: () => app.rdb() as unknown as CloudBaseDatabase,
    storage: app.storage as StorageClient,
  };
}

function initializeCloudBasePublicDatabase() {
  registerAdapter();
  const config = getCloudBaseConfig();
  const app = cloudbase.init({
    accessKey: config.publishableKey,
    auth: { detectSessionInUrl: false },
    env: config.env,
    persistence: "none",
    region: config.region,
  });
  return app.rdb() as unknown as CloudBaseDatabase;
}

export function createCloudBaseClients() {
  clients ??= initializeCloudBaseClients();
  return clients;
}

export function createCloudBaseAdminClients() {
  adminClients ??= initializeCloudBaseAdminClients();
  return adminClients;
}

export function createCloudBasePublicDatabase() {
  publicDatabase ??= initializeCloudBasePublicDatabase();
  return publicDatabase;
}

export function createCloudBaseDatabase(accessToken: string) {
  registerAdapter();
  const config = getCloudBaseConfig();
  const app = cloudbase.init({
    accessKey: accessToken,
    auth: { detectSessionInUrl: false },
    env: config.env,
    persistence: "none",
    region: config.region,
  });
  return app.rdb() as unknown as CloudBaseDatabase;
}
