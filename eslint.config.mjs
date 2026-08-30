import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    files: [
      "src/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}",
      "scripts/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}",
    ],
    ignores: [
      "scripts/backfill-place-localities.ts",
      "src/platform/supabase/admin.ts",
      "src/platform/supabase/client.ts",
      "src/platform/supabase/proxy.ts",
      "src/platform/supabase/server.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              message:
                "Import Supabase through src/platform adapters or an approved transition module.",
              name: "@supabase/ssr",
            },
            {
              message:
                "Import Supabase through src/platform adapters or an approved transition module.",
              name: "@supabase/supabase-js",
            },
            {
              message: "CloudBase SDKs are reserved for a future src/platform/cloudbase adapter.",
              name: "@cloudbase/js-sdk",
            },
            {
              message: "CloudBase SDKs are reserved for a future src/platform/cloudbase adapter.",
              name: "@cloudbase/node-sdk",
            },
            {
              message: "CloudBase SDKs are reserved for a future src/platform/cloudbase adapter.",
              name: "@cloudbase/manager-node",
            },
          ],
          patterns: [
            {
              group: [
                "@supabase/ssr/*",
                "@supabase/supabase-js/*",
                "@cloudbase/js-sdk/*",
                "@cloudbase/node-sdk/*",
                "@cloudbase/manager-node/*",
              ],
              message: "Provider SDK subpaths are restricted to exact platform adapter files.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".agents/**", ".codex/**", ".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
