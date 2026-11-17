export const aiScopes = [
  "trips:read",
  "trips:write",
  "ideas:read",
  "ideas:write",
  "places:read",
] as const;

export function availableAiScopes() {
  return aiScopes.filter(
    (scope) => scope !== "places:read" || process.env.MCP_PLACES_ENABLED === "1",
  );
}

function boundedLimit(value: string | undefined, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

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
    placesEnabled: process.env.MCP_PLACES_ENABLED === "1",
    placeLimits: {
      minute: boundedLimit(process.env.MCP_PLACES_PER_MINUTE, 5, 30),
      daily: boundedLimit(process.env.MCP_PLACES_PER_DAY, 100, 1000),
      globalDaily: boundedLimit(process.env.MCP_PLACES_GLOBAL_PER_DAY, 1000, 10000),
    },
  };
}
