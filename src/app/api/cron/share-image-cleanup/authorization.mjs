export function isShareImageCleanupCronAuthorized(request, cronSecret) {
  return Boolean(cronSecret) && request.headers.get("authorization") === `Bearer ${cronSecret}`;
}
