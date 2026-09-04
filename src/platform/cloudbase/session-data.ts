import type { AppUser } from "../contracts/auth.ts";
import { PlatformOperationError } from "../contracts/errors.ts";

export type CloudBaseSession = Readonly<{
  accessToken: string;
  refreshToken: string;
  user: AppUser;
}>;

export type CloudBaseJwtClaims = Readonly<{
  email?: unknown;
  exp?: unknown;
  is_anonymous?: unknown;
  sub?: unknown;
  phone?: unknown;
  phone_number?: unknown;
  user_metadata?: unknown;
}>;

function appUser(value: unknown): AppUser {
  if (!value || typeof value !== "object") {
    throw new PlatformOperationError("authentication_required", "Authentication is required.");
  }
  const user = value as Record<string, unknown>;
  let rawId = user.id;
  if (typeof rawId === "function") {
    try {
      rawId = Reflect.apply(rawId, value, []);
    } catch {
      rawId = undefined;
    }
  }
  const id = typeof rawId === "string" || typeof rawId === "number" ? String(rawId) : "";
  if (!id || user.is_anonymous === true) {
    throw new PlatformOperationError("authentication_required", "Authentication is required.");
  }
  const metadata =
    user.user_metadata && typeof user.user_metadata === "object"
      ? (user.user_metadata as Record<string, unknown>)
      : {};
  return Object.freeze({
    email: typeof user.email === "string" ? user.email : null,
    id,
    metadata: Object.freeze({ ...metadata }),
    phone:
      typeof user.phone === "string"
        ? user.phone
        : typeof user.phone_number === "string"
          ? user.phone_number
          : null,
  });
}

export function cloudBaseSessionFromData(data: unknown): CloudBaseSession {
  const root = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const raw = root.session && typeof root.session === "object" ? root.session : root;
  const session = raw as Record<string, unknown>;
  if (typeof session.access_token !== "string" || typeof session.refresh_token !== "string") {
    throw new PlatformOperationError("authentication_required", "Authentication is required.");
  }
  return Object.freeze({
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    user: appUser(session.user),
  });
}

export function cloudBaseSessionFromVerifiedTokens(input: {
  accessToken: string;
  refreshToken: string;
}): CloudBaseSession {
  let claims: CloudBaseJwtClaims;
  try {
    const payload = input.accessToken.split(".")[1];
    if (!payload) throw new Error("JWT payload is unavailable");
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as CloudBaseJwtClaims;
  } catch (error) {
    throw new PlatformOperationError("authentication_required", "Authentication is required.", {
      cause: error,
    });
  }
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now()) {
    throw new PlatformOperationError("authentication_required", "Authentication is required.");
  }
  return cloudBaseSessionFromVerifiedClaims(input, claims);
}

export function cloudBaseSessionFromVerifiedClaims(
  input: { accessToken: string; refreshToken: string },
  claims: CloudBaseJwtClaims,
): CloudBaseSession {
  return Object.freeze({
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    user: appUser({
      email: claims.email,
      id: claims.sub,
      is_anonymous: claims.is_anonymous,
      phone: claims.phone,
      phone_number: claims.phone_number,
      user_metadata: claims.user_metadata,
    }),
  });
}
