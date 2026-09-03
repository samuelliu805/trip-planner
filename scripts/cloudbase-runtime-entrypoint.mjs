import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const runtimeValues = [
  {
    name: "CLOUDBASE_ENV_ID",
    token: "__TRIP_PLANNER_CLOUDBASE_ENV_ID__",
  },
  {
    name: "CLOUDBASE_PUBLISHABLE_KEY",
    token: "__TRIP_PLANNER_CLOUDBASE_SERVER_KEY__",
  },
  {
    name: "CLOUDBASE_REGION",
    token: "__TRIP_PLANNER_CLOUDBASE_REGION__",
  },
  {
    name: "NEXT_PUBLIC_CLOUDBASE_ENV_ID",
    token: "__TRIP_PLANNER_NEXT_PUBLIC_CLOUDBASE_ENV_ID__",
  },
  {
    name: "NEXT_PUBLIC_CLOUDBASE_PUBLISHABLE_KEY",
    token: "__TRIP_PLANNER_CLOUDBASE_PUBLIC_KEY__",
  },
  {
    name: "NEXT_PUBLIC_CLOUDBASE_REGION",
    token: "__TRIP_PLANNER_NEXT_PUBLIC_CLOUDBASE_REGION__",
  },
  {
    name: "NEXT_PUBLIC_AMAP_JS_API_KEY",
    token: "__TRIP_PLANNER_AMAP_JS_API_KEY__",
  },
  {
    name: "NEXT_PUBLIC_SITE_URL",
    token: "__TRIP_PLANNER_SITE_URL__",
  },
];

async function filesBelow(path) {
  const pathStat = await stat(path).catch(() => null);
  if (!pathStat) return [];
  if (pathStat.isFile()) return [path];
  if (!pathStat.isDirectory()) return [];

  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => filesBelow(join(path, entry.name))));
  return nested.flat();
}

function replaceBuffer(source, needle, replacement) {
  const chunks = [];
  let start = 0;
  let index = source.indexOf(needle, start);
  while (index !== -1) {
    chunks.push(source.subarray(start, index), replacement);
    start = index + needle.length;
    index = source.indexOf(needle, start);
  }
  chunks.push(source.subarray(start));
  return Buffer.concat(chunks);
}

export async function injectCloudBaseRuntimePublicEnv({
  env = process.env,
  root = process.cwd(),
} = {}) {
  const files = (
    await Promise.all([filesBelow(join(root, ".next")), filesBelow(join(root, "server.js"))])
  ).flat();
  const sources = new Map(
    await Promise.all(files.map(async (path) => [path, await readFile(path)])),
  );
  const active = runtimeValues.filter(({ token }) => {
    const needle = Buffer.from(token);
    return [...sources.values()].some((source) => source.includes(needle));
  });

  const missing = active.filter(({ name }) => !env[name]?.trim()).map(({ name }) => name);
  if (missing.length) {
    throw new Error(`CloudBase runtime requires: ${missing.join(", ")}.`);
  }

  let changedFiles = 0;
  for (const [path, original] of sources) {
    let content = original;
    for (const { name, token } of active) {
      const needle = Buffer.from(token);
      if (!content.includes(needle)) continue;
      content = replaceBuffer(content, needle, Buffer.from(env[name]));
    }
    if (content !== original) {
      await writeFile(path, content);
      changedFiles += 1;
    }
  }

  if (active.length) {
    process.stdout.write(
      `Injected CloudBase runtime public configuration (${active.map(({ name }) => name).join(", ")}) into ${changedFiles} files.\n`,
    );
  }
  return { changedFiles, names: active.map(({ name }) => name) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await injectCloudBaseRuntimePublicEnv();
  await import(pathToFileURL(resolve("server.js")).href);
}
