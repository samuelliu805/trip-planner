# Public itinerary export

Every published Share Page exposes the same public itinerary without a login, cookie, or API key:

```text
GET /share/{publicToken}/export
GET /share/{publicToken}/export?format=json
GET /share/{publicToken}/export?format=csv
```

Add `download=1` to request a file attachment. JSON is the default and is recommended for AI agents.
Both the public page's **Share itinerary** dialog and the editor's **Share trip** dialog offer
**Export itinerary** for a published page: JSON/CSV selection, a link with a copy button, and
**Copy data** / **Download data** side by side. Copying data reads the endpoint
again so a revoked page cannot be copied from an old browser snapshot.

JSON has `schemaVersion: 1`, `trip`, `variant`, `metadata`, `citySequence`, `days`, and `savedRoutes`.
Days are ordered by day number, and items use the public page's canonical itinerary order.
Dates use the published ISO date; times retain the published local clock values, interpreted in
`trip.timezone`. A public snapshot can contain fewer days than `trip.dayCount`. Public day/item
references identify content within that Share Page and are not private database IDs.

CSV uses a header row and one row per item, with a blank item row for an empty published day.
It repeats trip/day context so each row can be read independently. `item_order` is the one-based
display position within its day. Columns ending in `_json` contain nested public data; saved routes
for the day repeat on each row. Missing values are empty fields. UTF-8 text, double-quote escaping,
and CRLF record separators preserve Unicode, commas, multiline notes, and quotes. Text beginning
with a spreadsheet formula marker receives a leading apostrophe; JSON preserves the original text.

Both formats use the existing anonymous public-share query. Visibility settings also apply to
notes, addresses, times, quick-action links, attachments, and routes. Public attachment references
are included only when enabled; photo pixels, photo-provider lookup information, private research,
prices, booking credentials, and owner identifiers are not exported. Attachment URLs are relative
to the export URL's origin. Exporting does not fetch attachments, photos, or calculate routes.

Responses are never cached and allow cross-origin reads without credentials. Invalid, missing,
or revoked tokens return `404`; unsupported formats return `400`; unexpected read failures return
a generic `503`. The endpoint follows the Share Page's publication and revocation lifecycle and
does not expose unpublished trips.
