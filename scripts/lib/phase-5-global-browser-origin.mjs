export const approvedGoogleBrowserHostname = "trip-planner-ivory-one.vercel.app";

const loopbackHostnames = new Set(["127.0.0.1", "::1", "localhost"]);

export function resolveGlobalBrowserOrigin(serverBaseUrl, allowedHostname, requireGoogleSmoke) {
  const server = new URL(serverBaseUrl);
  if (!requireGoogleSmoke) {
    return {
      browserBaseUrl: server.href,
      hostResolverArgument: null,
    };
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
    throw new Error("The Global Google browser smoke server must use a root loopback HTTP URL.");
  }
  if (allowedHostname !== approvedGoogleBrowserHostname) {
    throw new Error(
      "The Global Google browser smoke hostname must be the approved production host.",
    );
  }
  const browser = new URL(server.href);
  browser.hostname = approvedGoogleBrowserHostname;
  return {
    browserBaseUrl: browser.href,
    hostResolverArgument: `--host-resolver-rules=MAP ${approvedGoogleBrowserHostname} 127.0.0.1`,
  };
}
