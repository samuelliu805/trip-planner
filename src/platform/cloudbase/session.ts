import "server-only";

import { PlatformOperationError } from "@/platform/contracts/errors";

import { createCloudBaseClients } from "./client";
import { normalizeCloudBaseError } from "./errors";
import {
  cloudBaseSessionFromData,
  cloudBaseSessionFromVerifiedTokens,
  type CloudBaseSession,
} from "./session-data";

export const cloudBaseCookieNames = Object.freeze({
  accessToken: "tp-cn-access-token",
  refreshToken: "tp-cn-refresh-token",
});

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

async function verifyCloudBaseCookieSession(stored: { accessToken: string; refreshToken: string }) {
  const { db } = createCloudBaseClients(stored.accessToken);
  const result = await db.from("profiles").select("id");
  if (result.error) {
    throw new PlatformOperationError("authentication_required", "Authentication is required.", {
      cause: result.error,
    });
  }
  return cloudBaseSessionFromVerifiedTokens(stored);
}

export async function restoreCloudBaseSession(store: CloudBaseCookieStore) {
  const stored = readCloudBaseCookieSession(store);
  if (!stored) return null;
  return withCloudBaseAuthLock(async () => {
    try {
      return await verifyCloudBaseCookieSession(stored);
    } catch (error) {
      if (!(error instanceof PlatformOperationError) || error.code !== "authentication_required") {
        throw error;
      }
    }

    const { auth } = createCloudBaseClients();
    const established = await auth.setSession({
      access_token: stored.accessToken,
      refresh_token: stored.refreshToken,
    });
    const attempts = [established];
    if (established.error) attempts.push(await auth.refreshSession(stored.refreshToken));

    let lastError = established.error;
    for (const attempt of attempts) {
      lastError = attempt.error ?? lastError;
      try {
        const candidate = cloudBaseSessionFromData(attempt.data);
        const session = await verifyCloudBaseCookieSession({
          accessToken: candidate.accessToken,
          refreshToken: candidate.refreshToken,
        });
        writeCloudBaseSession(store, session);
        return session;
      } catch (error) {
        lastError = error;
      }
    }
    throw normalizeCloudBaseError(lastError, "Session refresh failed.");
  });
}

export { cloudBaseSessionFromData as sessionFromData } from "./session-data";
export type { CloudBaseSession } from "./session-data";
