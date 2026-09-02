const approvedAmapBrowserHostname = "trip-planner-cn-306129-11-1253819205.sh.run.tcloudbase.com";

const loopbackHostnames = new Set(["127.0.0.1", "::1", "localhost"]);

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
