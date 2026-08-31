import type { CloudBaseAuthClient } from "./client.ts";
import { normalizeCloudBaseError } from "./errors.ts";
import { cloudBaseSessionFromData } from "./session-data.ts";

async function currentSession(auth: CloudBaseAuthClient) {
  const result = await auth.getSession();
  if (result.error) throw normalizeCloudBaseError(result.error, "Session verification failed.");
  return cloudBaseSessionFromData(result.data);
}

export async function restoreCloudBaseAuthSession(
  auth: CloudBaseAuthClient,
  stored: { accessToken: string; refreshToken: string },
) {
  const established = await auth.setSession({
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken,
  });
  if (!established.error) {
    try {
      const session = await currentSession(auth);
      return {
        refreshed:
          session.accessToken !== stored.accessToken ||
          session.refreshToken !== stored.refreshToken,
        session,
      };
    } catch {
      // An expired access token may establish partially; refresh once below.
    }
  }

  const refreshed = await auth.refreshSession(stored.refreshToken);
  if (refreshed.error) {
    throw normalizeCloudBaseError(refreshed.error, "Session refresh failed.");
  }
  const candidate = cloudBaseSessionFromData(refreshed.data);
  const reset = await auth.setSession({
    access_token: candidate.accessToken,
    refresh_token: candidate.refreshToken,
  });
  if (reset.error) throw normalizeCloudBaseError(reset.error, "Session refresh failed.");
  return { refreshed: true, session: await currentSession(auth) };
}
