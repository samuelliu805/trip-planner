export const cloudBaseCookieNames = Object.freeze({
  accessToken: "tp-cn-access-token",
  refreshToken: "tp-cn-refresh-token",
});

export type CloudBaseCookieStore = Readonly<{
  delete?(name: string): void;
  get(name: string): { value: string } | undefined;
  set?(name: string, value: string, options: Readonly<Record<string, unknown>>): void;
}>;

type WritableCloudBaseSession = Readonly<{
  accessToken: string;
  refreshToken: string;
}>;

export function readCloudBaseCookieSession(store: CloudBaseCookieStore) {
  const accessToken = store.get(cloudBaseCookieNames.accessToken)?.value;
  const refreshToken = store.get(cloudBaseCookieNames.refreshToken)?.value;
  return accessToken && refreshToken ? { accessToken, refreshToken } : null;
}

export function writeCloudBaseSession(
  store: CloudBaseCookieStore,
  session: WritableCloudBaseSession,
) {
  const options = {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  } as const;
  store.set?.(cloudBaseCookieNames.accessToken, session.accessToken, options);
  store.set?.(cloudBaseCookieNames.refreshToken, session.refreshToken, options);
}

export function clearCloudBaseSession(store: CloudBaseCookieStore) {
  store.delete?.(cloudBaseCookieNames.accessToken);
  store.delete?.(cloudBaseCookieNames.refreshToken);
}
