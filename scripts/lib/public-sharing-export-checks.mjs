import assert from "node:assert/strict";
import { build } from "esbuild";
import { writeFile } from "node:fs/promises";
import { isPublicTransfer, orderedPublicItems } from "../../src/features/sharing/presentation.ts";
import { parisPublicItinerary } from "../../src/features/landing/landing-public-fixture.ts";

export async function checkPublicSharingExports(page, directory) {
  const bundle = await build({
    entryPoints: ["scripts/fixtures/public-sharing-export.tsx"],
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
    define: {
      "process.env": JSON.stringify({ NODE_ENV: "production", NEXT_PUBLIC_APP_REGION: "global" }),
    },
    plugins: [
      {
        name: "local-locale-action",
        setup(builder) {
          builder.onResolve({ filter: /^\.\/actions$/ }, (args) =>
            args.importer.endsWith("i18n-provider.tsx")
              ? { path: "locale-action", namespace: "test" }
              : null,
          );
          builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({
            contents: "export async function persistLocale() {}",
          }));
        },
      },
    ],
  });
  await page.addScriptTag({ type: "module", content: bundle.outputFiles[0].text });
  await page.waitForFunction(() => typeof window.testExport === "function");
  const summary = [];
  for (const templateId of ["journal", "ethereal"]) {
    const fixture = structuredClone(parisPublicItinerary);
    fixture.metadata.description = "";
    fixture.settings.showNotes = true;
    fixture.settings.showAttachments = true;
    fixture.settings.showPlacePhotos = true;
    fixture.days.forEach((day) => {
      day.notes = "";
      day.cityPhotoSource = {
        ref: "9".repeat(64),
        name: "Paris",
        googlePlaceId: "must-not-be-exported-city",
      };
      day.photoSource = {
        ref: "8".repeat(64),
        name: "Paris POI",
        googlePlaceId: "must-not-be-exported-poi",
      };
      day.items.forEach((item) => {
        item.notes = "";
      });
    });
    const item = fixture.days[0].items.find((item) => item.type === "activity");
    item.notes = "Owner's full note\n".repeat(18);
    item.media = [
      {
        id: "a".repeat(64),
        kind: "image",
        source: "attachment",
        label: "Booking confirmation.png",
        url: "/document-must-not-be-fetched.png",
      },
      {
        id: "google-place:" + item.ref,
        kind: "image",
        source: "google_place",
        url: "/photo-must-not-be-exported.jpg",
      },
    ];
    await page.evaluate(
      ({ fixture, templateId }) => window.testExportDocument(fixture, templateId),
      { fixture, templateId },
    );
    const document = page.locator("[data-timeline-export-root]").last();
    await document.waitFor();
    for (const day of fixture.days) {
      const section = document.locator(`[data-public-day-ref="${day.ref}"]`);
      const ordered = orderedPublicItems(day).filter((item) => item.type !== "location");
      assert.deepEqual(
        await section
          .locator(".edition-plan [data-public-item-ref]")
          .evaluateAll((nodes) => nodes.map((node) => node.dataset.publicItemRef)),
        ordered.filter((item) => !isPublicTransfer(item)).map((item) => item.ref),
      );
      assert.deepEqual(
        await section
          .locator(".edition-transport [data-public-item-ref]")
          .evaluateAll((nodes) => nodes.map((node) => node.dataset.publicItemRef)),
        ordered.filter(isPublicTransfer).map((item) => item.ref),
      );
    }
    assert.equal(await document.locator(".edition-note").textContent(), item.notes);
    assert.ok((await document.textContent()).includes("Booking confirmation.png"));
    assert.equal(await document.locator("img:not(.timeline-export-qr)").count(), 0);
    const full = await page.evaluate(
      ({ fixture, templateId }) => window.testExport(fixture, templateId),
      { fixture, templateId },
    );
    assert.ok(full.length > 0 && full.length <= 20);
    for (const part of full) {
      assert.equal(part.width, 1080);
      assert.ok(part.height <= 9600 && part.height > 0);
      assert.deepEqual(part.data.slice(0, 2), [255, 216]);
    }
    if (directory)
      await writeFile(`${directory}/${templateId}-export.jpg`, Buffer.from(full[0].data));
    // A single oversized note forces the actual measured continuation path.
    const long = structuredClone(fixture);
    long.days = [{ ...long.days[0], items: [{ ...item, notes: "旅行🧳\n".repeat(700) }] }];
    const parts = await page.evaluate(
      ({ fixture, templateId }) => window.testExport(fixture, templateId),
      { fixture: long, templateId },
    );
    assert.ok(parts.length > 1 && parts.length <= 20, "Oversized notes must paginate.");
    assert.ok(
      parts.every((part) => part.width === 1080 && part.height <= 9600 && part.data.length > 1000),
    );
    assert.equal(
      await page.locator("[data-timeline-export-host]").count(),
      0,
      "Capture hosts must always be removed.",
    );
    summary.push({ templateId, fullParts: full.length, longNoteParts: parts.length });
    await document.evaluate((node) => node.parentElement.remove());
  }
  if (directory)
    await writeFile(`${directory}/export-report.json`, JSON.stringify(summary, null, 2) + "\n");
  console.log(
    "PASS real JPEG exports, full notes/order, document names, no photo pixels, oversized pagination",
  );
}
