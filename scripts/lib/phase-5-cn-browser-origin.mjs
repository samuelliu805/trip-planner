const approvedAmapBrowserHostname = "trip-planner-cn-306129-11-1253819205.sh.run.tcloudbase.com";

const loopbackHostnames = new Set(["127.0.0.1", "::1", "localhost"]);

export function chromiumProxyArguments(ambient = process.env, bypassHostname) {
  const proxyValue = ambient.HTTPS_PROXY?.trim() || ambient.HTTP_PROXY?.trim();
  if (!proxyValue) return ["--no-proxy-server"];

  const proxy = new URL(proxyValue);
  if (
    !new Set(["http:", "https:"]).has(proxy.protocol) ||
    proxy.username ||
    proxy.password ||
    proxy.pathname !== "/" ||
    proxy.search ||
    proxy.hash
  ) {
    throw new Error("The CN browser test requires a root HTTP(S) proxy URL without credentials.");
  }
  const bypass = [bypassHostname, "localhost", "127.0.0.1", "[::1]"].filter(Boolean);
  return [`--proxy-server=${proxy.origin}`, `--proxy-bypass-list=${bypass.join(";")}`];
}

export function resolveCnBrowserOrigin(serverBaseUrl, allowedHostname, requireAmapSmoke) {
  const server = new URL(serverBaseUrl);
  if (!requireAmapSmoke) {
    return { browserBaseUrl: server.href, hostResolverArgument: null };
  }
  if (
    server.protocol !== "http:" ||
    !loopbackHostnames.has(server.hostname) ||
    server.username ||
    server.password ||
    server.pathname !== "/" ||
    server.search ||
    server.hash
  ) {
    throw new Error("The CN AMap browser smoke server must use a root loopback HTTP URL.");
  }
  if (allowedHostname !== approvedAmapBrowserHostname) {
    throw new Error("The CN AMap browser smoke hostname must be the approved CloudBase Run host.");
  }
  const browser = new URL(server.href);
  browser.hostname = approvedAmapBrowserHostname;
  return {
    browserBaseUrl: browser.href,
    hostResolverArgument: `--host-resolver-rules=MAP ${approvedAmapBrowserHostname} 127.0.0.1`,
  };
}

export { approvedAmapBrowserHostname };
