# CN sharing and route polish — requirements

## Context

The CN environment has been reset so authentication can be exercised with newly created password-enabled accounts. This change set completes the remaining public sharing, CN outbound-link, route-selection, and responsive navigation work without enabling WeChat sign-in.

## Functional requirements

1. CN data reset
   - Remove all existing CN end-user accounts, trips, itinerary rows, public-share artifacts, generated-image metadata, uploaded asset metadata, and physical storage objects.
   - Preserve authentication provider configuration, database schema/migrations, storage buckets, and other infrastructure required to register new users.
   - Verify the destructive operation with before/after counts and the selected environment identifier.

2. Public long-image sharing
   - The public itinerary Share dialog always exposes a visible trip-image section.
   - An owner viewing their own published page can create/regenerate and open/download the long image.
   - A non-owner can open/download the latest published long image when one exists; otherwise the UI clearly explains that no image is available yet.

3. Hard new-tab public-page opening
   - The owner Share settings primary “Open page” action creates a genuinely new browser tab and performs a full document navigation to the canonical absolute public URL.
   - It must not use Next.js client navigation, preserve stale in-app scroll/router state, or reuse the current tab.
   - The behavior must remain popup-safe by running directly from the user click, and expose an ordinary href fallback.

4. CN Idea outbound providers
   - In zh-CN, Idea booking/research actions use Chinese providers rather than the global provider list.
   - General/activity/meal options include Ctrip, Fliggy, and Meituan; accommodation also includes Tujia and relevant hotel-group official search pages; train includes Ctrip and 12306; car rental includes Zuzuche and CAR Inc.
   - On mobile, use provider HTTPS universal/app links where available so an installed app may open and the same URL otherwise falls back to the web. Provide an explicit store fallback where the provider exposes no usable web destination.
   - English/global behavior remains unchanged.

5. WeChat share metadata
   - Public share pages expose localized title, description, canonical URL, and square icon/image metadata usable by WeChat’s link-preview crawler.
   - Metadata must be server-rendered and must not require WeChat sign-in.

6. Variant switcher copy and affordance
   - Remove the sentence “Switch the Plan shown in the Matrix.” and its Chinese equivalent.
   - Display the dropdown triangle beside the active Plan name on mobile, tablet, and desktop.

7. Stable mobile map/table switching
   - Switching from Map back to Table changes the existing client workspace view without a document refresh or transient remount of the already-rendered table.
   - If work is pending, use a stable overlay/loading affordance; never render table → loading replacement → table.
   - Preserve viewport containment and the current plan/selection.

8. Default day-route mode
   - Default to driving when the day has no explicit Transport item, or when any explicit Transport is driving.
   - If explicit Transport exists and none is driving, prefer its normalized mode. When several modes are present, choose using trip distance: flight for very long distance, train for medium/long distance, metro/taxi for short urban distance, and cycling/walking for near distance.
   - Keep deterministic thresholds and unit-test boundary/fallback behavior.

9. Pull-up panel close affordance and localized variant names
   - Pull-up panels outside the map omit the top-left X close control while retaining drag, Escape, overlay, and explicit action dismissal.
   - Map pull-up panels may retain the X.
   - Newly created variants use the current locale and the next available alphabetic suffix: `Route A`, `Route B`, … in English and `方案 A`, `方案 B`, … in zh-CN. A new default must not reuse A when A already exists.

## Non-functional and regression requirements

- Maintain the repository’s overlay z-index, one-scroller mobile-dialog, single Trip app-bar, and tablet viewport-containment invariants.
- Keep Global behavior unchanged except for shared bug fixes that are explicitly cross-region.
- Add focused unit/integration coverage and extend the existing trip-planner E2E workflow where the behavior is observable.
- Run auth-route checks, lint/type/build/test suites, the relevant Global browser workflow, and CN checks that do not require an account. CN authenticated E2E is expected to remain unavailable until a fresh controlled account is created after the requested reset.
