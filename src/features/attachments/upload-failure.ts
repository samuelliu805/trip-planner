export class AttachmentUploadError extends Error {
  readonly failureReported: boolean;

  constructor(message: string, failureReported = false, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "AttachmentUploadError";
    this.failureReported = failureReported;
  }
}

export function attachmentUploadWasAborted(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function attachmentFailureWasReported(error: unknown): boolean {
  return error instanceof AttachmentUploadError && error.failureReported;
}

export function attachmentUploadResponseError(payload: unknown, fallback: string) {
  const message =
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
      ? payload.error
      : fallback;
  const failureReported = Boolean(
    payload &&
    typeof payload === "object" &&
    "failureReported" in payload &&
    payload.failureReported === true,
  );
  return new AttachmentUploadError(message, failureReported);
}

export function acknowledgeAttachmentFailure(error: unknown) {
  if (attachmentFailureWasReported(error)) return error;
  return new AttachmentUploadError(
    error instanceof Error ? error.message : "The upload failed.",
    true,
    error,
  );
}

export async function reportUnacknowledgedAttachmentFailure(
  error: unknown,
  reportFallback: () => Promise<unknown>,
): Promise<boolean> {
  if (attachmentUploadWasAborted(error) || attachmentFailureWasReported(error)) return false;
  try {
    await reportFallback();
    return true;
  } catch {
    return false;
  }
}
