import { PlatformOperationError, type PlatformErrorCode } from "../contracts/errors.ts";

type ErrorShape = Readonly<{
  category?: unknown;
  code?: unknown;
  errorCode?: unknown;
  message?: unknown;
}>;

function shape(error: unknown): ErrorShape {
  return error && typeof error === "object" ? (error as ErrorShape) : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function isCloudBaseScalarUuidParseError(error: unknown) {
  return /(?:SyntaxError:.*JSON|not valid JSON|JSON at position)/i.test(text(shape(error).message));
}

export function normalizeCloudBaseError(error: unknown, fallbackMessage: string) {
  if (error instanceof PlatformOperationError) return error;
  const candidate = shape(error);
  const code =
    `${text(candidate.code)} ${text(candidate.errorCode)} ${text(candidate.category)}`.toUpperCase();
  const message = text(candidate.message);
  const combined = `${code} ${message}`.toLowerCase();

  let platformCode: PlatformErrorCode = "unexpected";
  let safeMessage = fallbackMessage;
  if (code.includes("4001") || combined.includes("captcha")) {
    platformCode = "captcha_required";
    safeMessage = "Complete the security check, then try again.";
  } else if (
    combined.includes("invalid login") ||
    combined.includes("invalid password") ||
    combined.includes("invalid_credentials") ||
    combined.includes("invalid_username_or_password") ||
    combined.includes("incorrect password") ||
    combined.includes("user_not_found") ||
    combined.includes("wrong_password")
  ) {
    platformCode = "invalid_credentials";
    safeMessage = "Username or password is incorrect.";
  } else if (
    /(^|\s)16(\s|$)/.test(code) ||
    combined.includes("unauthenticated") ||
    combined.includes("invalid_grant") ||
    combined.includes("login_required") ||
    combined.includes("jwt") ||
    combined.includes("session") ||
    combined.includes("authentication required")
  ) {
    platformCode = "authentication_required";
    safeMessage = "Authentication is required.";
  } else if (code.includes("42501") || combined.includes("permission denied")) {
    platformCode = "forbidden";
    safeMessage = "You do not have permission to perform this operation.";
  } else if (code.includes("23505") || combined.includes("duplicate")) {
    platformCode = "conflict";
  } else if (
    combined.includes("storage_bucket_not_found") ||
    combined.includes("storage_object_not_found") ||
    combined.includes("not found")
  ) {
    platformCode = "not_found";
  } else if (
    combined.includes("storage_permission_denied") ||
    combined.includes("not authorized")
  ) {
    platformCode = "forbidden";
    safeMessage = "You do not have permission to perform this storage operation.";
  } else if (
    combined.includes("storage_content_length") ||
    combined.includes("mime") ||
    combined.includes("file size")
  ) {
    platformCode = "validation_failed";
  } else if (
    code.includes("22023") ||
    code.includes("23514") ||
    combined.includes("invalid input")
  ) {
    platformCode = "validation_failed";
    safeMessage = message || fallbackMessage;
  }
  return new PlatformOperationError(platformCode, safeMessage, { cause: error });
}

export function cloudBaseData<T>(
  result: Readonly<{ data: T | null; error: unknown | null }>,
  message: string,
): T {
  if (result.error) throw normalizeCloudBaseError(result.error, message);
  return result.data as T;
}
