import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const packagePath = (root, packageName) =>
  join(root, ".next/standalone/node_modules", ...packageName.split("/"));

function textFilesBelow(path) {
  if (!existsSync(path)) return [];
  const info = statSync(path);
  if (info.isFile()) return /\.(?:[cm]?js|json)$/.test(path) && info.size < 8_000_000 ? [path] : [];
  if (!info.isDirectory()) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    textFilesBelow(join(path, entry.name)),
  );
}

export function providerIsolationViolations(root, region) {
  if (!existsSync(join(root, ".next/standalone/server.js"))) {
    return ["Standalone build output is missing; run the regional production build first."];
  }
  const forbiddenPackages =
    region === "global"
      ? ["@cloudbase/adapter-node", "@cloudbase/js-sdk"]
      : ["@supabase/ssr", "@supabase/supabase-js", "@vis.gl/react-google-maps"];
  const violations = forbiddenPackages
    .filter((packageName) => existsSync(packagePath(root, packageName)))
    .map((packageName) => `Opposite-region runtime package is present: ${packageName}`);

  const serverText = textFilesBelow(join(root, ".next/standalone")).map((path) => ({
    path,
    source: readFileSync(path, "utf8"),
  }));
  if (
    region === "global" &&
    serverText.some(
      ({ path, source }) =>
        /\.[cm]?js$/.test(path) &&
        /@cloudbase\/js-sdk|trip-planner\/cloudbase\/phone-challenge|缺少依赖 ws/.test(source),
    )
  )
    violations.push("Global runtime contains a CloudBase runtime or missing-ws path.");

  if (region === "cn") {
    const clientText = textFilesBelow(join(root, ".next/static"));
    if (
      clientText.some((path) =>
        /maps\.googleapis\.com|maps\.google\.com|@vis\.gl\/react-google-maps/.test(
          readFileSync(path, "utf8"),
        ),
      )
    )
      violations.push("CN client output contains a Google Maps runtime path.");
  }
  return violations;
}

async function main() {
  const region = process.env.APP_REGION;
  if (region !== "global" && region !== "cn")
    throw new Error("APP_REGION must be global or cn for provider isolation verification.");
  const violations = providerIsolationViolations(process.cwd(), region);
  if (violations.length) throw new Error(violations.join("\n"));
  process.stdout.write(`${region} build provider isolation passed.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main();
