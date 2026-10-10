import assert from "node:assert/strict";
import { finishNonblockingCheck } from "./lib/nonblocking-cleanup.mjs";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
const bundle = await build({
  entryPoints: ["scripts/fixtures/nonblocking/upload-fixture.jsx"],
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' },
  plugins: [
    {
      name: "service-boundaries",
      setup(builder) {
        builder.onResolve({ filter: /platform\/composition\/client$/ }, () => ({
          path: resolve("scripts/fixtures/nonblocking/mock-actions.js"),
        }));
        builder.onResolve({ filter: /dom-renderer$/ }, () => ({
          path: resolve("scripts/fixtures/nonblocking/mock-image-renderer.js"),
        }));
        builder.onResolve({ filter: /variants\/queries|research-query$/ }, () => ({
          path: "query-invalidations",
          namespace: "stub",
        }));
        builder.onResolve(
          {
            filter:
              /(?:^|\/)(?:settings-actions|day-actions|idea-actions|idea-capture-actions|collaboration-actions|storage-actions|editor-action|workflow-actions|plan-actions|background-actions|idea-variant-plan-actions)$/,
          },
          () => ({ path: resolve("scripts/fixtures/nonblocking/mock-actions.js") }),
        );
        builder.onResolve({ filter: /(?:^|\/)actions$/ }, (args) => {
          if (
            args.importer.includes("/src/features/itinerary/") ||
            args.importer.includes("/src/features/research/") ||
            args.importer.includes("/src/features/trips/") ||
            args.importer.includes("/src/features/routes/") ||
            args.importer.includes("/src/features/variants/") ||
            args.importer.includes("/src/features/sharing/") ||
            args.importer.includes("/src/features/editing/")
          )
            return { path: resolve("scripts/fixtures/nonblocking/mock-actions.js") };
        });
        builder.onResolve({ filter: /upload-client$/ }, () => ({
          path: resolve("scripts/fixtures/nonblocking/mock-upload-client.js"),
        }));
        builder.onResolve({ filter: /(?:^|\/)actions$/ }, (args) => {
          if (args.importer.includes("/attachments/"))
            return { path: "attachments", namespace: "stub" };
          if (args.importer.includes("i18n-provider")) return { path: "locale", namespace: "stub" };
        });
        builder.onResolve({ filter: /planner-outbox-provider$/ }, () => ({
          path: "planner",
          namespace: "stub",
        }));
        builder.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({
          contents: {
            locale: "export async function persistLocale(){}",
            "query-invalidations":
              "export async function invalidateVariantComparison(){};export async function invalidateVariantDecisionSummary(){};export async function refreshResearchWorkspace(){}",
            planner: "export function usePlannerOutbox(){return null}",
            attachments:
              "export async function loadLatestAttachments(input){const r=await fetch('/latest?entity='+input.entityId);return r.ok?r.json():{error:'Target unavailable'};}",
          }[args.path],
          loader: "js",
        }));
      },
    },
  ],
});
let initial,
  bytesDelay = 0,
  parentDelay = 0,
  bindFault = false,
  calls = [],
  entities = new Set(),
  prepared = new Map(),
  bytes = new Map(),
  bound = new Map();
const server = createServer(async (req, res) => {
  if (req.url === "/") {
    res.setHeader("Content-Type", "text/html");
    res.end(
      `<div id="fixture"></div><script>window.__initial=${JSON.stringify(initial)}</script><script>${bundle.outputFiles[0].text}</script>`,
    );
    return;
  }
  if (req.url.startsWith("/latest?")) {
    res.statusCode = entities.has(new URL(req.url, "http://fixture").searchParams.get("entity"))
      ? 200
      : 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ data: [], version: 1 }));
    return;
  }
  if (req.url === "/download") {
    res.setHeader("Content-Type", "application/pdf");
    res.end(Buffer.from([...bytes.values()][0] || []));
    return;
  }
  if (req.method !== "POST") {
    res.statusCode = 404;
    res.end();
    return;
  }
  let body = "";
  for await (const chunk of req) body += chunk;
  const input = JSON.parse(body);
  calls.push({ path: req.url, input });
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/parent") {
    await new Promise((resolve) => setTimeout(resolve, parentDelay));
    const id = initial.applicationParent ? initial.canonicalId : input.entityId;
    entities.add(id);
    res.end(
      JSON.stringify({
        id,
        rows: [
          {
            id: initial.dayId,
            date: null,
            items: [
              {
                id,
                day_id: initial.dayId,
                details: { ideaResearchItemId: initial.sourceId, ideaJourneyIndex: 0 },
              },
            ],
          },
        ],
      }),
    );
    return;
  }
  if (req.url === "/prepare") {
    if (!entities.has(input.itemId)) {
      res.statusCode = 404;
      res.end("{}");
      return;
    }
    const previous = prepared.get(input.operationId);
    if (previous) assert.deepEqual(previous, input);
    else prepared.set(input.operationId, input);
    res.end("{}");
    return;
  }
  if (req.url === "/bytes") {
    await new Promise((resolve) => setTimeout(resolve, bytesDelay));
    const previous = bytes.get(input.operationId);
    if (previous) assert.deepEqual(previous, input.bytes);
    bytes.set(input.operationId, input.bytes);
    res.end("{}");
    return;
  }
  const attachment = {
    publicRef: "a".repeat(64),
    version: 1,
    status: "ready",
    draft: false,
    kind: "pdf",
    mimeType: "application/pdf",
    byteSize: 8,
    fileName: "fixture.pdf",
    sortOrder: 0,
    includeInShare: false,
  };
  if (req.url === "/finalize") {
    assert.ok(bytes.has(input.operationId));
    res.end(JSON.stringify(attachment));
    return;
  }
  if (req.url === "/bind") {
    const previous = bound.get(input.operationId);
    if (previous) assert.deepEqual(previous, input);
    bound.set(input.operationId, input);
    if (bindFault) {
      bindFault = false;
      res.statusCode = 500;
      res.end("{}");
      return;
    }
    res.end(JSON.stringify([attachment]));
    return;
  }
  res.statusCode = 404;
  res.end("{}");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const file = { name: "fixture.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7") };
const errors = [],
  passed = [];
async function scenario(name, run, newEntity = false, applicationParent = false) {
  let scenarioFailure;
  if (process.env.NONBLOCKING_CASE && !new RegExp(process.env.NONBLOCKING_CASE).test(name)) return;
  initial = {
    tripId: randomUUID(),
    entityId: randomUUID(),
    sessionId: randomUUID(),
    newEntity,
    applicationParent,
    canonicalId: randomUUID(),
    parentId: randomUUID(),
    dayId: randomUUID(),
    sourceId: randomUUID(),
  };
  bytesDelay = 0;
  parentDelay = 0;
  bindFault = false;
  calls = [];
  entities = new Set(newEntity ? [] : [initial.entityId]);
  prepared = new Map();
  bytes = new Map();
  bound = new Map();
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));
  try {
    await page.goto(origin);
    await page.getByRole("button", { name: "Inspect owner" }).click();
    await run(page, context);
    passed.push(name);
    console.log(`PASS ${name}`);
  } catch (error) {
    scenarioFailure = error;
    process.stderr.write(
      JSON.stringify({
        errors,
        alerts: await page
          .locator('[role="alert"]')
          .allTextContents()
          .catch((error) => [String(error)]),
      }) + "\n",
    );
    throw error;
  } finally {
    await finishNonblockingCheck(scenarioFailure, [
      ["Browser context cleanup", () => context.close()],
    ]);
  }
}
const choose = (page) => page.locator('input[type="file"]').setInputFiles(file);
const ready = (page) =>
  page.waitForFunction(
    () => window.__owner?.tasks.length === 0 && window.__owner?.completed.length === 1,
  );
let primaryFailure;
try {
  await scenario("file survives close and upload leaves typing responsive", async (page) => {
    bytesDelay = 3000;
    await choose(page);
    await page.waitForFunction(() => window.__owner.tasks.length === 1);
    await page.getByRole("textbox", { name: "Continuous text" }).fill("上传期间中文尾部");
    await page.getByRole("button", { name: "Toggle editor" }).click();
    await page.getByRole("button", { name: "Toggle editor" }).click();
    await ready(page);
    assert.equal(
      await page.getByRole("textbox", { name: "Continuous text" }).inputValue(),
      "上传期间中文尾部",
    );
    assert.equal(bound.size, 1);
    const response = await page.request.get(origin + "/download");
    assert.deepEqual(await response.body(), file.buffer);
  });
  await scenario("refresh restores file and exact operation identity", async (page) => {
    bytesDelay = 3000;
    await choose(page);
    await page.waitForFunction(() => window.__owner.tasks[0]?.progress.stage === "uploading");
    const id = await page.evaluate(() => window.__owner.tasks[0].operationId);
    await page.reload();
    await page.getByRole("button", { name: "Inspect owner" }).click();
    await ready(page);
    assert.deepEqual([...prepared.keys()], [id]);
    assert.equal(bytes.size, 1);
    assert.equal(bound.size, 1);
  });
  await scenario(
    "lost binding acknowledgement retries once without upload or duplicate bind",
    async (page) => {
      bindFault = true;
      await choose(page);
      await page.getByRole("button", { name: "Retry", exact: true }).waitFor();
      const previous = calls.filter((call) => call.path === "/bind")[0].input;
      await page.getByRole("button", { name: "Retry", exact: true }).click();
      await ready(page);
      assert.equal(calls.filter((call) => call.path === "/bytes").length, 1);
      assert.equal(bound.size, 1);
      calls
        .filter((call) => call.path === "/bind")
        .forEach((call) => assert.deepEqual(call.input, previous));
    },
  );
  await scenario(
    "file chosen before creation waits for durable parent acknowledgement",
    async (page) => {
      parentDelay = 3000;
      await choose(page);
      await page.waitForFunction(() => window.__owner.tasks.length === 1);
      assert.equal(prepared.size, 0);
      await page.getByRole("button", { name: "Create entity" }).click();
      await ready(page);
      assert.equal(entities.size, 1);
      assert.equal(bound.size, 1);
    },
    true,
  );
  await scenario(
    "pending Idea upload restores and binds only to its canonical receipt identity",
    async (page) => {
      parentDelay = 1200;
      bytesDelay = 2000;
      await page.getByRole("button", { name: "Create entity" }).click();
      await choose(page);
      await page.waitForFunction(() => window.__owner.tasks.length === 1);
      assert.equal(prepared.size, 0);
      await page.getByRole("button", { name: "Toggle editor" }).click();
      await page.waitForFunction(() => window.__owner.tasks[0]?.progress.stage === "uploading");
      const id = await page.evaluate(() => window.__owner.tasks[0].operationId);
      await page.reload();
      await page.getByRole("button", { name: "Inspect owner" }).click();
      await ready(page);
      assert.deepEqual([...prepared.keys()], [id]);
      assert.equal(bound.size, 1);
      assert.equal([...prepared.values()][0].itemId, initial.canonicalId);
      assert.equal([...bound.values()][0].itemId, initial.canonicalId);
      assert.notEqual(initial.canonicalId, initial.entityId);
      assert.deepEqual(await (await page.request.get(origin + "/download")).body(), file.buffer);
    },
    true,
    true,
  );
  await scenario("IndexedDB failure keeps the File and never claims local save", async (page) => {
    await page.evaluate(() => {
      indexedDB.open = () => {
        throw new DOMException("Quota full", "QuotaExceededError");
      };
    });
    await choose(page);
    await page.getByRole("button", { name: "Retry", exact: true }).waitFor();
    assert.equal(prepared.size, 0);
    assert.equal(
      await page.locator("[data-sync-status]").getAttribute("data-sync-status"),
      "Local save failed",
    );
    await page.getByRole("textbox", { name: "Continuous text" }).fill("still editable");
    assert.equal(await page.evaluate(() => window.__owner.tasks[0].file.size), 8);
  });
  await scenario(
    "account change isolates waiting files and prevents wrong-account send",
    async (page) => {
      await choose(page);
      await page.waitForFunction(() => window.__owner.tasks.length === 1);
      await page.getByRole("button", { name: "Switch account" }).click();
      assert.equal(await page.getByText("fixture.pdf", { exact: true }).count(), 0);
      assert.equal(prepared.size, 0);
      await page.getByRole("button", { name: "Switch account" }).click();
      await page.getByText("fixture.pdf", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Create entity" }).click();
      await ready(page);
      assert.equal(bound.size, 1);
    },
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    `Upload owner E2E: ${passed.length} scenarios passed; signed storage transport is a controlled service boundary.`,
  );
} catch (error) {
  primaryFailure = error;
  throw error;
} finally {
  await finishNonblockingCheck(primaryFailure, [
    ["Browser cleanup", () => browser.close()],
    [
      "Fixture server cleanup",
      () =>
        new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    ],
  ]);
}
