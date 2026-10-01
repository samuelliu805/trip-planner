import { createCipheriv, publicEncrypt, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { deriveOverviewStages } from "../src/features/routes/overview.ts";
import { createAmapRoutesProvider } from "../src/lib/providers/amap/routes/amap-routes-core.ts";
import { wgs84Coordinates } from "../src/lib/providers/maps/types.ts";
import { parseFirstJsonObject } from "./cloudbase-cli-json.mjs";
import { runCommand } from "./cloudbase-run-source-submitter.mjs";

// Temporary, read-only diagnostic for the user-reported trip. No itinerary or route writes.
const envId = "trip-planner-cn-dev-d3bz94038b26";
const tripId = "1bad5dab-bd00-403e-b427-c7d87f70ba3f";
const variantId = "8e5c3c61-58fa-4986-80c2-ce83dbf43649";
if (process.env.CLOUDBASE_ENV_ID !== envId || !process.env.AMAP_WEB_SERVICE_KEY)
  throw new Error("Diagnostic target or AMap credential unavailable.");

const sql = `select jsonb_build_object('days', coalesce(jsonb_agg(jsonb_build_object(
  'id', d.id, 'day_number', d.day_number, 'items', coalesce((select jsonb_agg(
  jsonb_build_object('id', i.id, 'type', i.type, 'title', i.title, 'sort_order', i.sort_order,
    'place', case when p.coordinate_system = 'wgs84' then jsonb_build_object(
      'id', p.id, 'latitude', p.latitude, 'longitude', p.longitude,
      'localityName', p.locality_name, 'displayName', p.display_name,
      'countryCode', p.country_code, 'coordinateSystem', p.coordinate_system) end)
  order by i.sort_order, i.id) from public.itinerary_items i
  left join public.places p on p.id = i.place_id
  where i.day_id = d.id and i.trip_id = '${tripId}' and i.variant_id = '${variantId}'), '[]'::jsonb)
) order by d.day_number), '[]'::jsonb)) from public.trip_days d
join public.route_variants v on v.id = d.variant_id
where d.variant_id = '${variantId}' and v.trip_id = '${tripId}'`;

const result = await runCommand(
  "npx",
  [
    "--yes",
    "--package",
    "@cloudbase/cli@3.8.1",
    "tcb",
    "--yes",
    "--env-id",
    envId,
    "api",
    "tcb",
    "ExecutePGSql",
    "--body",
    JSON.stringify({ EnvId: envId, Sql: sql }),
    "--json",
  ],
  { capture: true, timeoutMs: 90_000 },
);
if (result.code !== 0) throw new Error("Diagnostic read-only PG request failed.");
const envelope = parseFirstJsonObject(result.output);
const response = envelope.data?.Response ?? envelope.data ?? envelope.Response ?? envelope;
if (response.Error || !Array.isArray(response.Rows))
  throw new Error(`Diagnostic PG result invalid: ${Object.keys(response).join(",")}`);
const cells =
  typeof response.Rows[0] === "string" ? JSON.parse(response.Rows[0]) : response.Rows[0];
const workspace = typeof cells[0] === "string" ? JSON.parse(cells[0]) : cells[0];
const stages = deriveOverviewStages(workspace.days);
if (stages.length < 2) throw new Error("Reported trip has fewer than two route stages.");
process.stdout.write(
  `Loaded ${workspace.days.length} days and ${stages.length} overview stages.\n`,
);

function seal(payload) {
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
  const output = Buffer.from(
    JSON.stringify({
      key: publicEncrypt(
        { key: readFileSync("/tmp/amap-diagnostic-public.pem"), oaepHash: "sha256" },
        key,
      ).toString("base64"),
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: encrypted.toString("base64"),
    }),
  ).toString("base64");
  process.stdout.write(`AMAP_ENCRYPTED_DIAGNOSTIC=${output}\n`);
}
seal({ stages: stages.map(({ latitude, longitude }) => ({ latitude, longitude })) });
const diagnostics = [];
for (let index = 0; index < stages.length - 1; index += 1) {
  const from = stages[index];
  const to = stages[index + 1];
  const request = {
    origin: wgs84Coordinates(from.latitude, from.longitude),
    destination: wgs84Coordinates(to.latitude, to.longitude),
    legSignature: `reported-overview-${index + 1}`,
    mode: "self_driving",
    position: index + 1,
  };
  let raw;
  let status;
  let captured;
  const provider = createAmapRoutesProvider({
    apiKey: process.env.AMAP_WEB_SERVICE_KEY,
    retryDelayMs: 0,
    fetchImplementation: async (url, init) => {
      // One real request per leg; any adapter retry reads the captured response.
      captured ??= (async () => {
        const fetched = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
        status = fetched.status;
        raw = await fetched.text();
      })();
      await captured;
      return new Response(raw, { status, headers: { "Content-Type": "application/json" } });
    },
    timeoutMs: 30_000,
  });
  let outcome;
  try {
    const leg = await provider.calculateLeg(request);
    outcome = {
      source: leg.geometry.source,
      distanceMeters: leg.distanceMeters,
      durationSeconds: leg.durationSeconds,
    };
  } catch (error) {
    outcome = { errorCode: error.code ?? error.name };
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    body = { malformedJson: raw?.slice(0, 1000) };
  }
  const paths = body.route?.paths ?? body.data?.paths;
  const responseSummary = {
    httpStatus: status,
    status: body.status,
    info: body.info,
    infocode: body.infocode,
    errcode: body.errcode,
    count: body.count,
    paths: paths?.map((path) => ({
      distance: path.distance,
      duration: path.duration,
      cost: path.cost,
      steps: path.steps?.map((step) => ({
        duration: step.duration,
        distance: step.distance,
        polylineType: typeof step.polyline,
        polylineStart:
          typeof step.polyline === "string" ? step.polyline.slice(0, 100) : step.polyline,
      })),
    })),
  };
  diagnostics.push({ request, responseSummary, outcome });
  seal({ diagnostics: [diagnostics.at(-1)] });
  process.stdout.write(
    `Leg ${index + 1}: ${JSON.stringify({ ...outcome, httpStatus: status, infoCode: body.infocode ?? body.errcode })}\n`,
  );
  await new Promise((resolve) => setTimeout(resolve, 1200));
}
