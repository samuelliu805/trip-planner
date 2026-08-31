import "server-only";

import cloudbase from "@cloudbase/js-sdk";
import nodeAdapter from "@cloudbase/adapter-node";

import { PlatformOperationError } from "@/platform/contracts/errors";

import { getCloudBaseConfig } from "./config";

export type CloudBaseSdkResult<T = unknown> = Promise<{
  data: T | null;
  error: unknown | null;
}>;

export type CloudBaseAuthClient = Readonly<{
  getSession(): CloudBaseSdkResult;
  refreshSession(refreshToken?: string): CloudBaseSdkResult;
  setSession(input: { access_token: string; refresh_token: string }): CloudBaseSdkResult;
  signInWithPassword(input: { password: string; username: string }): CloudBaseSdkResult;
  signOut(): Promise<unknown>;
}>;

export type CloudBaseQuery = PromiseLike<{ data: unknown; error: unknown }> & {
  delete(): CloudBaseQuery;
  eq(column: string, value: unknown): CloudBaseQuery;
  insert(values: Readonly<Record<string, unknown>>): CloudBaseQuery;
  select(columns?: string): CloudBaseQuery;
  update(values: Readonly<Record<string, unknown>>): CloudBaseQuery;
};

export type CloudBaseDatabase = Readonly<{
  from(table: string): CloudBaseQuery;
  rpc(name: string, parameters: Readonly<Record<string, unknown>>): CloudBaseSdkResult;
}>;

let adaptersRegistered = false;

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

export function createCloudBaseClients(accessKey?: string) {
  registerAdapter();
  const config = getCloudBaseConfig();
  const app = cloudbase.init({
    accessKey: accessKey ?? config.publishableKey,
    auth: { detectSessionInUrl: false },
    env: config.env,
    persistence: "none",
    region: config.region,
  });
  return {
    auth: app.auth as unknown as CloudBaseAuthClient,
    db: app.rdb() as unknown as CloudBaseDatabase,
  };
}
