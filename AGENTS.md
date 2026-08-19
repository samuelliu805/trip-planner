# Workspace implementation invariants

These rules apply to all future UI work in this repository.

## Overlay and frozen-layer stacking

- Keep normal workspace content, sticky headers, and frozen Matrix columns at `z-index: 80` or lower.
- Render Dialog and Sheet overlays at `z-index: 100` or higher, their content at `110` or higher, nested Select/Dropdown content at `120` or higher, nested confirmation dialogs at `130` or higher, and tooltips at `150` or higher.
- Never raise a table header, frozen column, map control, or other workspace element above a modal overlay to fix a local stacking bug.

## Mobile overlays

- Dialogs and Sheets must fit inside the visual viewport, use `max-width: 100%`, prevent horizontal overflow, and have one intentional vertical scroller.
- Controls must shrink within their grid or flex container (`min-width: 0`) and retain 44px minimum touch targets.
- Verify modal and Sheet behavior at both 390px and 430px widths. Opening an overlay must cover every frozen Matrix layer, and the page beneath it must not horizontally swipe.

## Tablet workspace containment and Matrix freezing

- Trip planner detail routes must occupy exactly one visual viewport. Keep the global header and planner toolbar pinned, prevent document-level vertical or horizontal scrolling, and let only the intended Matrix, panel, or overlay scroller move.
- Lock the owner planner route to the viewport at the root (`html`, `body`, trips shell, and planner page) instead of relying on a sticky toolbar inside a document scroller. The app bar and context bar must remain non-scrolling flex siblings of the workspace content.
- Every flex/grid child that owns the Matrix or map height must use `min-height: 0`; map panes must clip their contents. Do not fix bottom gaps with compensating margins, padding, or viewport-height guesses.
- Apply scroll containment and Safari compositing safeguards to the Matrix at every breakpoint. At a scroll boundary, continued touch movement must not rubber-band the frozen header, date/day columns, workspace shell, or expose blank space beyond the workspace.
- Verify owner planner behavior at 768px, 820px, and 1024px widths in both relevant orientations. Assert that `documentElement` and `body` do not exceed `innerHeight`, a forced `window.scrollTo` leaves `scrollY` at 0, the table/map reaches the viewport bottom (or the mobile tab bar top), and the app bar remains at top 0 while the Matrix scrolls in either axis.

## Software keyboard and visual viewport

- iOS and iPadOS reveal a focused field by offsetting the visual viewport inside the layout viewport. A fixed, non-scrolling shell cannot undo that with `window.scrollTo`, so the app bar slides out of view and a blank strip appears under the workspace once the keyboard collapses.
- Keep `interactive-widget=resizes-content` on the root viewport export. On browsers that honour it the layout viewport shrinks with the keyboard and no offset ever appears.
- `useAppViewport` publishes `--app-viewport-height` and `--app-viewport-top` and every fixed shell (`.trip-planner-page`, `.trip-detail-page`, `.public-itinerary-shell`, planner sheets) sizes and positions from them. Publish those properties **only while the visual viewport is genuinely obscured or offset**, and remove them otherwise so the shell falls back to `100dvh`; a stale measurement must never be able to strand the shell short of the viewport bottom.
- Measure inline on the event. A `requestAnimationFrame` callback is never delivered in a throttled or backgrounded tab, which silently freezes the published geometry.
- Do not reintroduce unconditional viewport-height variables (the reverted `--planner-visual-viewport-*` pair), and do not compensate for the keyboard with padding or viewport-height arithmetic.

## Itinerary type scale

- The owner Matrix and the read-only Table share one scale: 15px item titles, 13px meta and column headers. Do not reintroduce `sm:`-prefixed downscaling that shrinks text on larger screens.
- No public template may set a font size below `0.6875rem` outside the long-image export stylesheets, which render on a fixed canvas and keep their own scale. Raise a template's own declaration rather than adding a global override, so per-template intent stays readable in one place.
- Larger text must not shrink controls: item rows and app bar controls keep a 44px target at every touch width, and Matrix column widths track the type scale so place names are not truncated.

## Trip app bar

- The bar carries one merged identity control: back, then trip title plus the active Plan, then the section nav (≥960px) and Share. Trip-scoped actions (plans, compare, Share, Trip settings) live in that one menu; account actions belong to `/trips`, one level up.
- Never add a second overflow menu to the bar — the plan context bar already owns one for table actions.

## Recurring tablet table regressions (release-blocking)

- Treat any blank strip between an editable or read-only table and its bottom boundary as a regression. Bottom navigation that is already a flex sibling must not be compensated for with Matrix padding, spacer rows, margins, or viewport-height arithmetic.
- On tablet, a short table must fill the Matrix to its bottom boundary: distribute spare height across data rows instead of leaving an empty strip after the final row.
- Mobile and tablet bottom view navigation must span the full shell width as a non-scrolling flex sibling, not an overlay on the Table. At maximum Matrix scroll, the final row must terminate directly above it without padding, a blank strip, or a hidden overlap.
- The app bar/header and bottom navigation must be non-scrolling siblings of the table workspace. At tablet widths, only the Matrix may scroll; `window.scrollY`, the app bar top, and the table workspace bottom must remain fixed while the Matrix is forced to every scroll boundary.
- A table header must meet the first data row with no spacer or unused row height. Assert that the first row's top equals the header's bottom within 1px in both editable and read-only tables.
- Frozen header cells and their body columns must share one explicit width and left offset. At 768px, 820px, and 1024px, assert that the first header cell and first body cell have matching `left`, `right`, and `width` values after horizontal scrolling.
- Verify these contracts on both the authenticated owner planner and a public read-only Table. For public pages, also open the Share dialog after every template-root positioning change; portal content must remain fixed, visible, and above all frozen layers.

## Production file size

- Keep manually maintained production files focused and at or below 300 lines when practical. When a UI component or stylesheet grows past 300 lines, split it by responsibility instead of adding another section; generated types and comprehensive test suites are exempt.

## Public map synchronization

- Change content-to-map selection only after an explicit click or Enter/Space activation. Hover and focus alone must never move or rescope the map.
- Keep marker-to-content selection explicit on marker click, with scroll/focus restoration and no owner-data mutation.

## Public itinerary information hierarchy

- Transport type and short name labels (for example, Flight, Train, or Car rental) must remain fully visible on one line in Overview, Table, and Timeline at every breakpoint. Never truncate or ellipsize these labels; wrap or resize the surrounding layout first, while keeping route, service number, schedule, place, and notes available as supporting detail.
- Never show a generic placeholder such as `Field` when the itinerary category is known. Display the real category label or omit that label and promote the item title.
- In Overview, present multiple transport entries as one compact grouped information band with separators instead of giving each transport the visual weight or vertical footprint of a standalone item card.

## Public auth routes and dev-server route state

- `/login` and `/signup` are permanent public App Router routes. After changing, adding, removing, or renaming anything under `src/app`, verify both with `npm run check:auth-routes`; a valid check returns `200` and the expected form heading for each route.
- Do not add temporary browser-verification pages under `src/app`. Use existing routes, component fixtures outside the route tree, or a disposable copy/worktree so a long-lived Next.js dev server cannot retain a stale route tree.
- This repository uses webpack for `npm run dev` because stale Turbopack route state has repeatedly made every nested route return `404` while `/` still returned `200`. Do not remove `--webpack` without proving repeated route add/remove/rename cycles keep `/login` and `/signup` healthy.
- If `/` works but `/login`, `/signup`, `/trips`, and other nested routes all return `404`, treat the running dev server as stale: stop it, restart `npm run dev`, and rerun `npm run check:auth-routes`. Do not rewrite or duplicate valid route files to work around that process state.
