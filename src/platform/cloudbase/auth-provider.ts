import "server-only";

import { cookies, headers } from "next/headers";

import type { AuthProvider, SignInInput } from "@/platform/contracts/auth";
import { PlatformOperationError } from "@/platform/contracts/errors";

import { createCloudBaseClients } from "./client";
import { cloudBaseData, normalizeCloudBaseError } from "./errors";
import {
  clearCloudBaseSession,
  readCloudBaseCookieSession,
  readCloudBaseVerifiedCookieSession,
  readCloudBaseVerifiedUser,
  sessionFromData,
  withCloudBaseAuthLock,
  writeCloudBaseSession,
} from "./session";

export class CloudBaseAuthProvider implements AuthProvider {
  async getCurrentUser() {
    const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
    return readCloudBaseVerifiedCookieSession(cookieStore, headerStore)?.user ?? null;
  }

  async requireUser() {
    const user = await this.getCurrentUser();
    if (!user)
      throw new PlatformOperationError("authentication_required", "Authentication is required.");
    return user;
  }

  async signIn(input: SignInInput) {
    if (input.method !== "username_password") {
      throw new PlatformOperationError(
        "unsupported_operation",
        "CloudBase is configured for username and password sign-in.",
      );
    }
    const store = await cookies();
    return withCloudBaseAuthLock(async () => {
      const { auth } = createCloudBaseClients();
      const result = await auth.signInWithPassword({
        password: input.password,
        username: input.username,
      });
      if (result.error) throw normalizeCloudBaseError(result.error, "Authentication failed.");
      const verified = await auth.getSession();
      const session = sessionFromData(cloudBaseData(verified, "Authentication failed."));
      writeCloudBaseSession(store, session);
      return session.user;
    });
  }

  async signOut() {
    const store = await cookies();
    try {
      const stored = readCloudBaseVerifiedUser(await headers())
        ? readCloudBaseCookieSession(store)
        : null;
      if (stored) {
        await withCloudBaseAuthLock(async () => {
          const { auth } = createCloudBaseClients();
          const established = await auth.setSession({
            access_token: stored.accessToken,
            refresh_token: stored.refreshToken,
          });
          cloudBaseData(established, "Sign out failed.");
          await auth.signOut();
        });
      }
    } catch (error) {
      throw normalizeCloudBaseError(error, "Sign out failed.");
    } finally {
      clearCloudBaseSession(store);
    }
  }
}
