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
  return /(?:syntax\s*error.*json|syntaxerror:.*json|not valid json|json at position|unexpected (?:end|number).*json)/i.test(
    text(shape(error).message),
  );
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
    combined.includes("too many") ||
    combined.includes("rate limit") ||
    combined.includes("rate_limit") ||
    combined.includes("frequent") ||
    combined.includes("频繁")
  ) {
    platformCode = "rate_limited";
    safeMessage = "Too many code requests. Wait a moment, then try again.";
  } else if (code.includes("INVALID_ARGUMENT") || code.includes("VERIFICATION_FAILED")) {
    platformCode = "otp_invalid";
    safeMessage = "That verification code is expired or incorrect. Request a new code if needed.";
  } else if (
    combined.includes("verification expired") ||
    combined.includes("verification_expired") ||
    combined.includes("code expired") ||
    combined.includes("验证码已过期")
  ) {
    platformCode = "otp_expired";
    safeMessage = "That verification code has expired. Request a new code.";
  } else if (
    combined.includes("invalid verification") ||
    combined.includes("verification_code") ||
    combined.includes("invalid otp") ||
    combined.includes("already used") ||
    combined.includes("code used") ||
    combined.includes("验证码错误") ||
    combined.includes("验证码已使用")
  ) {
    platformCode = "otp_invalid";
    safeMessage = "That verification code is incorrect.";
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
  // Provider responses can contain credentials, phone numbers, verification
  // payloads, or user input. Keep only the bounded code/message so an
  // accidentally logged normalized error cannot serialize the raw response.
  return new PlatformOperationError(platformCode, safeMessage);
}

export function cloudBaseData<T>(
  result: Readonly<{ data: T | null; error: unknown | null }>,
  message: string,
): T {
  if (result.error) throw normalizeCloudBaseError(result.error, message);
  return result.data as T;
}
