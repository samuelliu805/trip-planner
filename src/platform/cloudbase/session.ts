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
import {
  readCloudBaseCookieSession,
  writeCloudBaseSession,
  type CloudBaseCookieStore,
} from "./session-cookies";

export {
  clearCloudBaseSession,
  cloudBaseCookieNames,
  readCloudBaseCookieSession,
  writeCloudBaseSession,
  type CloudBaseCookieStore,
} from "./session-cookies";
export const cloudBaseVerifiedUserHeader = "x-trip-planner-cloudbase-user";

type HeaderStore = Readonly<{ get(name: string): string | null }>;

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
