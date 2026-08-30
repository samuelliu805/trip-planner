export type PlaceProviderErrorCode =
  "cancelled" | "invalid_response" | "resolve_failed" | "search_failed" | "unavailable";

const safeMessages: Record<PlaceProviderErrorCode, string> = {
  cancelled: "The places request was cancelled.",
  invalid_response: "The selected place is missing required map details.",
  resolve_failed: "The place could not be selected.",
  search_failed: "Places search is unavailable right now.",
  unavailable: "Places search is unavailable right now.",
};

export class PlaceProviderError extends Error {
  readonly code: PlaceProviderErrorCode;

  constructor(code: PlaceProviderErrorCode, options?: { cause?: unknown; message?: string }) {
    super(options?.message ?? safeMessages[code], { cause: options?.cause });
    this.code = code;
    this.name = "PlaceProviderError";
  }
}
