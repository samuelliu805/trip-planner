import "server-only";

import { cookies, headers } from "next/headers";

import type {
  AuthProvider,
  PasswordManagementProvider,
  SignInInput,
} from "@/platform/contracts/auth";
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

function phoneForCloudBase(phone: string) {
  return phone.startsWith("+86") ? phone.slice(3) : phone;
}

export class CloudBaseAuthProvider implements AuthProvider, PasswordManagementProvider {
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
    if (input.method === "email_password") {
      throw new PlatformOperationError(
        "unsupported_operation",
        "CloudBase is configured for phone or username and password sign-in.",
      );
    }
    const store = await cookies();
    return withCloudBaseAuthLock(async () => {
      const { auth } = createCloudBaseClients();
      const result = await auth.signInWithPassword(
        input.method === "phone_password"
          ? { password: input.password, phone: phoneForCloudBase(input.phone) }
          : { password: input.password, username: input.username },
      );
      if (result.error) throw normalizeCloudBaseError(result.error, "Authentication failed.");
      const verified = await auth.getSession();
      const session = sessionFromData(cloudBaseData(verified, "Authentication failed."));
      writeCloudBaseSession(store, session);
      return session.user;
    });
  }

  async changePassword(input: Readonly<{ currentPassword: string; newPassword: string }>) {
    const store = await cookies();
    const headerStore = await headers();
    const stored = readCloudBaseVerifiedCookieSession(store, headerStore);
    if (!stored)
      throw new PlatformOperationError("authentication_required", "Authentication is required.");
    await withCloudBaseAuthLock(async () => {
      const { auth } = createCloudBaseClients();
      cloudBaseData(
        await auth.setSession({
          access_token: stored.accessToken,
          refresh_token: stored.refreshToken,
        }),
        "Authentication is required.",
      );
      const changed = await auth.resetPasswordForOld({
        new_password: input.newPassword,
        old_password: input.currentPassword,
      });
      if (changed.error)
        throw normalizeCloudBaseError(changed.error, "Password could not be changed.");
      const verified = await auth.getSession();
      if (!verified.error && verified.data) {
        writeCloudBaseSession(store, sessionFromData(verified.data));
      }
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
