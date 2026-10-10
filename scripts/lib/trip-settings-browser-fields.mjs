import assert from "node:assert/strict";

/** Settings use typed actions; dates and currency no longer belong to FormData. */
export async function readTripSettingsBrowserFields(browser, { evaluate }) {
  const fields = await evaluate(
    browser,
    `(() => {
      const title = document.querySelector('#trip-title');
      const dayCount = document.querySelector('#trip-day-count');
      const startDate = document.querySelector('#trip-start-date');
      const endDate = document.querySelector('#trip-end-date');
      const currency = document.querySelector('#trip-currency');
      if (!title || !dayCount || !startDate || !endDate || !currency) return null;
      return { title: title.value, dayCount: dayCount.value, startDate: startDate.value,
        endDate: endDate.value, currency: currency.textContent.trim() };
    })()`,
  );
  assert(fields, "The complete current Trip settings editor must be available.");
  assert.match(fields.currency, /^[A-Z]{3}$/, "The selected currency must be captured.");
  return fields;
}
