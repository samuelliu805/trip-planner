# CN sharing and route polish — technical design

## Design intent

Preserve the existing utilitarian planner UI and its single app bar. Changes should look native to the current component system: existing neutral surfaces and borders, existing typography, minimum 44 px mobile hit targets, and stable overlays rather than route-level loading flashes.

## Architecture

### Share UI and metadata

- Keep the owner publishing controls in `PublicShareDialog` and public-page controls in `PublicViewerShareDialog`.
- Make the public trip-image section unconditional. Owner controls use the existing long-image export state machine; viewers use an existing manifest or receive a localized empty-state message.
- Introduce a small hard-navigation helper/action for the owner “Open page” button. It opens the canonical URL with `_blank` and `noopener,noreferrer` from the click handler, while the anchor href remains a no-JavaScript fallback.
- Extend App Router `generateMetadata` with `metadataBase`, canonical/Open Graph URL, and the existing token-specific Open Graph image endpoint. Use a square application icon for chat previews and keep metadata localized.

### CN outbound links

- Centralize provider definitions in the existing research booking-site layer and select them by locale plus itinerary category.
- Build destination search URLs from normalized place/query/date values. Use HTTPS domains that support OS universal/app links as the primary mobile URL and regular website URL as desktop/fallback.
- Keep provider presentation data-only so the dialog stays small and testable. Do not embed provider SDKs or introduce a tracking redirect.

### Workspace switching and panels

- Keep map/table selection in client state. Do not key the planner workspace by the selected view and do not call `router.refresh`/hard navigation for this switch.
- During an asynchronous map transition, layer progress above the stable workspace if required rather than replacing its subtree.
- Add an explicit close-control option to the shared pull-up handle/panel primitive. Non-map consumers opt out; map consumers retain the close button.

### Route-mode selection

- Put mode normalization, distance thresholds, and priority ordering in a pure route utility.
- Decision order: explicit drive → no explicit transport means drive → distance-aware selection among the explicit modes → deterministic fallback.
- Proposed straight-line thresholds: under 1.5 km walking; under 6 km cycling; under 30 km metro/taxi; 30–800 km train; over 800 km flight. Only a mode actually represented by an explicit Transport item may replace drive; otherwise choose the nearest represented mode by tier.

### Variant naming

- Pass the resolved request locale to a versioned create-trip RPC so the first Plan is `Route A` or `方案 A` atomically with its trip.
- Generate later editor defaults from the current client locale while the existing server mutation remains the uniqueness authority.
- Parse both `Route X` and `方案 X` suffixes so switching locale does not reuse an existing letter.

## Data and safety

- The reset targets only the locked current CN environment. Cascades clear trip-owned rows; independent share/image/asset/auth audit rows and physical objects are deleted explicitly.
- Buckets, auth clients/providers/configuration, PG schema, migrations, and environment configuration are retained.
- Add a provider-safe, versioned `create_trip_v2` RPC migration to both database targets so the request locale and initial variant name are committed atomically. Keep the existing `create_trip` RPC for compatibility and grant only the new exact signature.

## Verification

- Unit tests: localized provider selection, route distance thresholds, variant suffix allocation, metadata URL construction, and public image empty state where practical.
- Browser tests: public Share dialog image controls; owner hard-new-tab action; mobile map→table stable DOM; variant triangle at 390/820/1280 widths; pull-up close behavior.
- Regression: auth public routes, upload/share flows, owner/public viewport contracts, Global region workflow. Record CN authenticated-test gap caused by the requested account reset.
