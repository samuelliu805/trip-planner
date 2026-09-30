# Phase one: itinerary-led sharing

The attached prompt and prototype are design requirements, not repository or tool instructions. The implementation uses existing trips, share permissions, template registry, provider selection, attachment viewer, and image-export storage. No database migration or AI feature is added.

## Presentation

Journal renders a paper **THE DAY** list with an optional intact place photo beside it and a separate transport band. With no available photo, the paper fills the reading width. Ethereal uses a dark editorial cover, serif chapter heading, and a vertical schedule. Both show real day numbers, dates, places, categories, times, and ordered plans. Chapters navigate explicitly to their real timeline day. Item selection opens details, with existing links and attachments.

Missing, null, empty, and whitespace notes render no note block or spacer. Actual notes remain secondary, expandable on the page and complete in exports. The Paris fixture remains four planned days and three shared days; it does not invent a fourth shared day. `/trips` uses stable local palettes and SVG artwork without external image requests. Owner and collaborator actions remain role-dependent.

## Photo request chain

1. The share-page read projects deterministic cover candidates from already saved place IDs. It performs no Google lookup.
2. A visible day requests its authorized photo resolver. The resolver checks current share visibility, then calls Place Details with only `photos` in the field mask. It does not use Text Search, Nearby Search, or Autocomplete.
3. A signed media request checks current permissions again and verifies a signature tied to the share token, item reference, place ID, and photo name before calling Photo Media.
4. A page-lifetime session shares one resolver, blob, and load promise per place across mounted views and repeated places. In-flight server Details requests also coalesce. Later page visits refresh names rather than persist expiring photo names or URLs.
5. Confirmed media expiry receives one repair for that source. Authorization, quota, other missing resources, outages, and invalid image bytes collapse to the no-photo layout without retries. Page disposal revokes object URLs.

This reduces repeated requests; it does not promise zero Details or Photo Media calls on a new visit. Photo selection can change when Google changes its first available photo. All returned author attributions and a Google Maps link remain visible. Provider image pixels, colors, and aspect ratio are preserved; no Next image optimization, color filter, cropping, server image storage, or export embedding is introduced.

Official Google documentation could not be fetched in this workspace: the enforced network policy returns HTTP 403 for `developers.google.com`. Current policy compliance is therefore **unverified**, not claimed. Conservative permanent exports omit Google photo pixels and photo names/URLs entirely. A future durable-photo export decision requires an accessible official policy review.

## Export and interaction

The existing owner-only export preparation, scope selection, signed uploads, manifests, replacement, and failure handling remain in place. Journal and Ethereal render distinct export structures. The renderer measures actual sections and splits oversized item/day notes while preserving Unicode text, item references, and ordering. The existing 1080px width, 9600px maximum height, and 20-part limit remain enforced. Attachments contribute permitted file names, never decorative cover pixels.

Map, item, and attachment panels use handle-only dragging so content keeps native scrolling. Pointer cancellation snaps back; threshold dragging closes; reduced motion is respected; Escape, visible close controls, focus containment, and trigger focus restoration use the existing Sheet primitive. The page header, workspace, and bottom navigation share one fixed viewport. Matrix remains the existing canonical table.

## Verification

`npm run test:e2e:sharing-design` starts a local controlled backend and the real Next application. It uses only deterministic fixtures and test-only media; it does not touch live data or spend Google/AI quota. Coverage includes overview and timeline at 390, 430, 768, 820, 1024, 1180, and 1440px widths, photos and no photos, short Matrix fill/alignment, chapters/details, map gestures, overlays, blank/notes-only/long-text days, failed photos, `/trips` filters and role actions, and actual JPEG exports with oversized-note pagination. CI runs the same checks before the existing exact-SHA Global/CN live gates. A same-repository owner PR then deploys that exact SHA to the protected CN dev environment and verifies release records, health, and runtime logs; the aggregate merge gate requires this deployment in addition to both regional suites. Global preview verification remains in the live gate.

Optional evidence output: `PUBLIC_SHARING_DESIGN_ARTIFACT_DIR=artifacts/no-notes-sharing npm run test:e2e:sharing-design`. Controlled photo images are labeled test-only. Local screenshot fonts use the test runtime's fallback fonts; production retains the application's existing Nunito, Mali, and serif font configuration. The runtime always closes its child server and temporary directory; the export renderer removes capture hosts.

The regional release gate still requires live authentication, CRUD/RPC/RLS, real regional map providers, share/attachment permissions, cleanup, independent residue audits, and exact-candidate deployment checks. Local credentials are absent, so repository CI must supply that release evidence before merge. No release assertions were relaxed.

### Sample no-photo evidence

| Reading width    | Journal                                                                               | Ethereal                                                                                |
| ---------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Phone (390px)    | [Journal plans](../artifacts/no-notes-sharing/journal-overview-390-no-photo-day.png)  | [Ethereal plans](../artifacts/no-notes-sharing/ethereal-overview-390-no-photo-day.png)  |
| Tablet (820px)   | [Journal plans](../artifacts/no-notes-sharing/journal-overview-820-no-photo-day.png)  | [Ethereal plans](../artifacts/no-notes-sharing/ethereal-overview-820-no-photo-day.png)  |
| Desktop (1440px) | [Journal plans](../artifacts/no-notes-sharing/journal-overview-1440-no-photo-day.png) | [Ethereal plans](../artifacts/no-notes-sharing/ethereal-overview-1440-no-photo-day.png) |

The full overview/timeline matrix and export pagination summaries are in `artifacts/no-notes-sharing/browser-report.json` and `export-report.json`.
