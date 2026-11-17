import assert from "node:assert/strict";

export async function verifyEditorItineraryExport({ browser, evaluate, waitFor, publicUrl }) {
  const input = `document.querySelector('.public-share-settings-dialog input[aria-label="Public export URL"]')`;
  await waitFor(browser, `Boolean(${input})`, "editor itinerary export");
  const expected = new URL(publicUrl);
  expected.pathname += "/export";
  expected.searchParams.set("format", "json");
  const layout = await evaluate(
    browser,
    `(() => {
    const input = ${input};
    const section = input.closest('section');
    const copyLink = input.parentElement.querySelector('button');
    const copyData = [...section.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Copy data');
    const download = section.querySelector('a[download]');
    return {
      url: input.value,
      heading: section.querySelector('h3').textContent.trim(),
      format: section.querySelector('select').value,
      linkCopyLabel: copyLink.getAttribute('aria-label'),
      inlineLinkCopy: Math.abs(input.getBoundingClientRect().top - copyLink.getBoundingClientRect().top) <= 1,
      actionRow: copyData.parentElement === download.parentElement && Math.abs(copyData.getBoundingClientRect().top - download.getBoundingClientRect().top) <= 1,
      extraCopy: [...section.querySelectorAll('p')].filter((paragraph) => !paragraph.hasAttribute('aria-live')).length,
      download: download.href,
    };
  })()`,
  );
  assert.deepEqual(layout, {
    url: expected.toString(),
    heading: "Export itinerary",
    format: "json",
    linkCopyLabel: "Copy export link",
    inlineLinkCopy: true,
    actionRow: true,
    extraCopy: 0,
    download: `${expected}&download=1`,
  });
  const data = await evaluate(
    browser,
    `(async () => {
    const response = await fetch((${input}).value, { credentials: 'omit', cache: 'no-store' });
    const data = await response.json();
    return { status: response.status, schemaVersion: data.schemaVersion, hasDays: Array.isArray(data.days) };
  })()`,
  );
  assert.deepEqual(data, { status: 200, schemaVersion: 1, hasDays: true });
  await evaluate(
    browser,
    `(() => {
    const select = (${input}).closest('section').querySelector('select');
    select.value = 'csv';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`,
  );
  await waitFor(browser, `(${input}).value.endsWith('format=csv')`, "editor CSV export format");
  const csv = await evaluate(
    browser,
    `(async () => {
    const response = await fetch((${input}).value, { credentials: 'omit', cache: 'no-store' });
    return { status: response.status, valid: (await response.text()).startsWith('"schema_version","trip_title"') };
  })()`,
  );
  assert.deepEqual(csv, { status: 200, valid: true });
}
