import "server-only";

import { normalizeCloudBaseError } from "./errors";
import type { CloudBaseSession } from "./session-data";
import {
  cloudBaseSessionFromVerifiedClaims,
  cloudBaseSessionFromVerifiedTokens,
} from "./session-data";
import { restoreCloudBaseAuthSession } from "./session-runtime";
import { createCloudBaseClients } from "./client";
import { CloudBaseAccessTokenExpiredError, verifyCloudBaseAccessToken } from "./access-token";
import { getCloudBaseConfig } from "./config";

export const cloudBaseCookieNames = Object.freeze({
  accessToken: "tp-cn-access-token",
  refreshToken: "tp-cn-refresh-token",
});
export const cloudBaseVerifiedUserHeader = "x-trip-planner-cloudbase-user";

type HeaderStore = Readonly<{ get(name: string): string | null }>;

export type CloudBaseCookieStore = Readonly<{
  delete?(name: string): void;
  get(name: string): { value: string } | undefined;
  set?(name: string, value: string, options: Readonly<Record<string, unknown>>): void;
}>;

let authQueue = Promise.resolve();

export async function withCloudBaseAuthLock<T>(work: () => Promise<T>): Promise<T> {
  const previous = authQueue;
  let release: () => void = () => undefined;
  authQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await work();
  } finally {
    release();
  }
}

export function readCloudBaseCookieSession(store: CloudBaseCookieStore) {
  const accessToken = store.get(cloudBaseCookieNames.accessToken)?.value;
  const refreshToken = store.get(cloudBaseCookieNames.refreshToken)?.value;
  return accessToken && refreshToken ? { accessToken, refreshToken } : null;
}

export function encodeCloudBaseVerifiedUser(session: CloudBaseSession) {
  return encodeURIComponent(JSON.stringify(session.user));
}

export function readCloudBaseVerifiedUser(store: HeaderStore) {
  const encoded = store.get(cloudBaseVerifiedUserHeader);
  if (!encoded) return null;
  try {
    const candidate = JSON.parse(decodeURIComponent(encoded)) as Record<string, unknown>;
    if (typeof candidate.id !== "string" || !candidate.id) return null;
    return Object.freeze({
      email: typeof candidate.email === "string" ? candidate.email : null,
      id: candidate.id,
      metadata: Object.freeze(
        candidate.metadata && typeof candidate.metadata === "object"
          ? { ...(candidate.metadata as Record<string, unknown>) }
          : {},
      ),
    });
  } catch {
    return null;
  }
}

export function readCloudBaseVerifiedCookieSession(
  cookieStore: CloudBaseCookieStore,
  headerStore: HeaderStore,
) {
  const verifiedUser = readCloudBaseVerifiedUser(headerStore);
  if (!verifiedUser) return null;
  const stored = readCloudBaseCookieSession(cookieStore);
  if (!stored) return null;
  const session = cloudBaseSessionFromVerifiedTokens(stored);
  return session.user.id === verifiedUser.id ? session : null;
}

export function writeCloudBaseSession(store: CloudBaseCookieStore, session: CloudBaseSession) {
  const options = {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  } as const;
  store.set?.(cloudBaseCookieNames.accessToken, session.accessToken, options);
  store.set?.(cloudBaseCookieNames.refreshToken, session.refreshToken, options);
}

export function clearCloudBaseSession(store: CloudBaseCookieStore) {
  store.delete?.(cloudBaseCookieNames.accessToken);
  store.delete?.(cloudBaseCookieNames.refreshToken);
}

export async function restoreCloudBaseSession(
  store: CloudBaseCookieStore,
  options: { persistRefreshedSession?: boolean } = {},
) {
  const stored = readCloudBaseCookieSession(store);
  if (!stored) return null;
  try {
    const claims = await verifyCloudBaseAccessToken(stored.accessToken, getCloudBaseConfig().env);
    return cloudBaseSessionFromVerifiedClaims(stored, claims);
  } catch (error) {
    if (!(error instanceof CloudBaseAccessTokenExpiredError)) throw error;
  }
  return withCloudBaseAuthLock(async () => {
    try {
      const restored = await restoreCloudBaseAuthSession(createCloudBaseClients().auth, stored);
      const { session } = restored;
      if (options.persistRefreshedSession && restored.refreshed) {
        writeCloudBaseSession(store, session);
      }
      return session;
    } catch (error) {
      throw normalizeCloudBaseError(error, "Session refresh failed.");
    }
  });
}

export { cloudBaseSessionFromData as sessionFromData } from "./session-data";
export type { CloudBaseSession } from "./session-data";
