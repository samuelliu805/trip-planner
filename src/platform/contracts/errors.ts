export type PlatformErrorCode =
  | "authentication_required"
  | "captcha_required"
  | "conflict"
  | "forbidden"
  | "invalid_credentials"
  | "not_found"
  | "otp_expired"
  | "otp_invalid"
  | "provider_unavailable"
  | "rate_limited"
  | "unexpected"
  | "unsupported_operation"
  | "validation_failed";

export class PlatformOperationError extends Error {
  readonly code: PlatformErrorCode;

  constructor(code: PlatformErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = "PlatformOperationError";
  }
}
