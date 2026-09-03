import type { NextConfig } from "next";
import { withPostHogConfig } from "@posthog/nextjs-config";
import { resolve } from "node:path";

import { resolveTelemetryConfig } from "./src/lib/telemetry/config";
import { resolveDeploymentProviderConfig } from "./src/platform/config/provider-matrix";

// Validate only deployment selectors here. Provider credentials stay lazy in their entrypoints.
const deploymentProviders = resolveDeploymentProviderConfig(process.env);
const providerSuffix = deploymentProviders.appRegion === "cn" ? "cloudbase" : "supabase";
const mapSuffix = deploymentProviders.appRegion === "cn" ? "amap" : "google";
const selectedAliases = {
  "@/lib/providers/maps/planner-map-canvas-selected": `./src/lib/providers/maps/planner-map-canvas-${mapSuffix}.tsx`,
  "@/lib/providers/maps/planner-map-provider-selected": `./src/lib/providers/maps/planner-map-provider-${mapSuffix}.tsx`,
  "@/platform/composition/client-selected": `./src/platform/composition/client-${providerSuffix}.ts`,
  "@/platform/composition/proxy-selected": `./src/platform/composition/proxy-${providerSuffix}.ts`,
  "@/platform/composition/server-selected": `./src/platform/composition/server-${providerSuffix}.ts`,
} as const;

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  turbopack: { resolveAlias: selectedAliases },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      ...Object.fromEntries(
        Object.entries(selectedAliases).map(([specifier, target]) => [
          specifier,
          resolve(process.cwd(), target),
        ]),
      ),
    };
    return config;
  },
  async headers() {
    return [
      {
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Referrer-Policy", value: "strict-origin" },
        ],
        source: "/share/:path*",
      },
    ];
  },
};

const buildTelemetryConfig = resolveTelemetryConfig(
  {
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
    NEXT_PUBLIC_TELEMETRY_ENABLED: process.env.NEXT_PUBLIC_TELEMETRY_ENABLED,
    NEXT_PUBLIC_TELEMETRY_ENVIRONMENT: process.env.NEXT_PUBLIC_TELEMETRY_ENVIRONMENT,
    NEXT_PUBLIC_TELEMETRY_PROVIDER: process.env.NEXT_PUBLIC_TELEMETRY_PROVIDER,
    NEXT_PUBLIC_TELEMETRY_REGION: process.env.NEXT_PUBLIC_TELEMETRY_REGION,
    VERCEL_ENV: process.env.VERCEL_ENV,
  },
  { validateVercelEnvironment: true },
);
const postHogApiKey = process.env.POSTHOG_API_KEY?.trim();
const postHogProjectId = process.env.POSTHOG_PROJECT_ID?.trim();
const postHogUiHost = process.env.POSTHOG_UI_HOST?.replace(/\/+$/, "");
const releaseCandidate = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
const release = /^[0-9a-f]{7,64}$/i.test(releaseCandidate ?? "") ? releaseCandidate : undefined;
const sourceMapUploadEnabled =
  buildTelemetryConfig.enabled &&
  /^phx_[A-Za-z0-9_-]+$/.test(postHogApiKey ?? "") &&
  /^\d+$/.test(postHogProjectId ?? "") &&
  postHogUiHost === "https://us.posthog.com";

export default sourceMapUploadEnabled
  ? withPostHogConfig(nextConfig, {
      host: postHogUiHost,
      logLevel: "warn",
      personalApiKey: postHogApiKey!,
      projectId: postHogProjectId!,
      sourcemaps: {
        build: release,
        deleteAfterUpload: true,
        enabled: true,
        releaseName: "trip-planner-web",
        releaseVersion: release,
      },
    })
  : nextConfig;
