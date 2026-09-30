import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stopChild } from "./child-process.mjs";
import { parisPublicItinerary } from "../../src/features/landing/landing-public-fixture.ts";

const userId = "22222222-2222-4222-8222-222222222222";
const user = {
  id: userId,
  aud: "authenticated",
  role: "authenticated",
  email: "design-test@example.invalid",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
export const designTrips = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    owner_id: userId,
    title: "Paris Trip",
    status: "open",
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    owner_id: "55555555-5555-4555-8555-555555555555",
    title: "A shared trip",
    status: "done",
  },
].map((trip) => ({
  ...trip,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  version: 1,
  content_version: 1,
  currency: "EUR",
  day_count: 4,
  start_date: "2027-04-12",
  end_date: "2027-04-15",
  timezone: "Europe/Paris",
  route_variants: [
    {
      id: "66666666-6666-4666-8666-666666666666",
      name: "Route A",
      color: "#78b79a",
      is_primary: true,
    },
  ],
}));

export function designSessionCookie() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const accessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: userId, aud: "authenticated", role: "authenticated", exp })}.local-test-only`;
  return {
    name: "sb-127-auth-token",
    value: `base64-${encode({ access_token: accessToken, refresh_token: "local-test-only", expires_at: exp, expires_in: 3600, token_type: "bearer", user })}`,
    domain: "localhost",
    path: "/",
  };
}

export async function startPublicSharingDesignRuntime() {
  const directory = await mkdtemp(join(tmpdir(), "trip-planner-design-"));
  let fixture = structuredClone(parisPublicItinerary);
  const backend = createServer(async (request, response) => {
    for await (const chunk of request) {
      void chunk;
      /* Drain local SDK input without storing credentials. */
    }
    const url = new URL(request.url, "http://localhost");
    response.setHeader("Content-Type", "application/json");
    if (
      url.pathname.endsWith("get_public_share_page_v3") ||
      url.pathname.endsWith("get_public_itinerary_v4")
    )
      return response.end(JSON.stringify(fixture));
    if (url.pathname.endsWith("public_share_page_image_v1")) return response.end("null");
    if (url.pathname === "/auth/v1/user") return response.end(JSON.stringify(user));
    if (url.pathname === "/rest/v1/profiles")
      return response.end(
        request.headers.accept?.includes("object")
          ? JSON.stringify({ preferred_locale: "en" })
          : "[]",
      );
    if (url.pathname === "/rest/v1/trips") {
      const filter = url.searchParams.get("status")?.replace(/^eq\./, "");
      return response.end(
        JSON.stringify(designTrips.filter((trip) => !filter || trip.status === filter)),
      );
    }
    response.statusCode = 404;
    response.end("{}");
  });
  await new Promise((resolve) => backend.listen(0, "127.0.0.1", resolve));
  const backendPort = backend.address().port;
  const placeholder = createServer();
  await new Promise((resolve) => placeholder.listen(0, "127.0.0.1", resolve));
  const port = placeholder.address().port;
  await new Promise((resolve) => placeholder.close(resolve));
  const fontMock = join(directory, "font-mock.cjs");
  await writeFile(
    fontMock,
    `module.exports=new Proxy({}, {get:(_,url)=>String(url).includes('Mali')?"@font-face{font-family:'Mali';src:local('Georgia');font-weight:400 700;}":"@font-face{font-family:'Nunito';src:local('Arial');font-weight:100 900;}"});`,
  );
  const env = {
    ...process.env,
    APP_REGION: "global",
    AUTH_PROVIDER: "supabase",
    DATA_PROVIDER: "supabase",
    STORAGE_PROVIDER: "supabase",
    NEXT_PUBLIC_APP_REGION: "global",
    NEXT_PUBLIC_MAPS_PROVIDER: "google",
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${backendPort}`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "ci-design-placeholder",
    NEXT_PUBLIC_TELEMETRY_ENABLED: "false",
    NEXT_PUBLIC_TELEMETRY_ENVIRONMENT: "development",
    NEXT_PUBLIC_SITE_URL: `http://localhost:${port}`,
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fontMock,
  };
  for (const name of [
    "GOOGLE_PLACES_API_KEY",
    "GOOGLE_ROUTES_API_KEY",
    "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
  ])
    delete env[name];
  // Candidate availability only. Every photo request is intercepted by the browser fixture.
  env.GOOGLE_PLACES_API_KEY = "local-design-test-only";
  const child = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "--webpack", "-p", String(port)],
    { env, stdio: ["ignore", "ignore", "pipe"] },
  );
  let diagnostics = "";
  child.stderr.on("data", (chunk) => (diagnostics = `${diagnostics}${chunk}`.slice(-3000)));
  const baseUrl = `http://localhost:${port}`;
  const close = async () => {
    await stopChild(child);
    await new Promise((resolve) => backend.close(resolve));
    await rm(directory, { force: true, recursive: true });
  };
  try {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      assert.equal(child.exitCode, null, "Controlled design app exited early.");
      try {
        if ((await fetch(`${baseUrl}/icon.svg`)).ok)
          return {
            baseUrl,
            close,
            setFixture: (next) => {
              fixture = next;
            },
          };
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`Controlled design app did not start. ${diagnostics}`);
  } catch (error) {
    await close();
    throw error;
  }
}
