export const aiScopes = ["trips:read", "trips:write", "ideas:read", "ideas:write"] as const;

export function aiConfig() {
  if (process.env.MCP_ENABLED !== "1") throw new Error("MCP_DISABLED");
  const url = new URL(process.env.MCP_PUBLIC_ORIGIN ?? "");
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      !(local && process.env.MCP_ALLOW_LOCAL_HTTP === "1" && !process.env.VERCEL))
  ) {
    throw new Error("INVALID_MCP_ORIGIN");
  }
  return {
    origin: url.origin,
    issuer: url.origin,
    resource: `${url.origin}/mcp`,
    rateLimit: Math.min(600, Math.max(1, Number(process.env.MCP_RATE_LIMIT_PER_MINUTE) || 60)),
  };
}
