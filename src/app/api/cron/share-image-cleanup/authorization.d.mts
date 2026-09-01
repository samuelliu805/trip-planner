export function isShareImageCleanupCronAuthorized(
  request: Pick<Request, "headers">,
  cronSecret: string | undefined,
): boolean;
