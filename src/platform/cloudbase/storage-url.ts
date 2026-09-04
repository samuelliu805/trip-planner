const repeatedStorageGatewayPrefix = /\/v1\/storages(?=\/v1\/storages(?:\/|$))/g;

export function normalizeCloudBaseStorageUrl(value: string) {
  const url = new URL(value);
  while (repeatedStorageGatewayPrefix.test(url.pathname)) {
    repeatedStorageGatewayPrefix.lastIndex = 0;
    url.pathname = url.pathname.replace(repeatedStorageGatewayPrefix, "");
  }
  repeatedStorageGatewayPrefix.lastIndex = 0;
  return url.toString();
}
