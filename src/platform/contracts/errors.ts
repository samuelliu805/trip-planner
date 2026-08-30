export type PlatformErrorCode =
  | "authentication_required"
  | "conflict"
  | "not_found"
  | "provider_unavailable"
  | "unexpected"
  | "unsupported_operation";

export class PlatformOperationError extends Error {
  readonly code: PlatformErrorCode;

  constructor(code: PlatformErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = "PlatformOperationError";
  }
}
