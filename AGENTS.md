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

## Itinerary item editor

- The editor is one progressive modal: a centred Dialog from 640px up, a full-height sheet below it. Do not reintroduce a side sheet for editing, and never show a workspace side panel next to the open editor.
- The step navigator is numbered circles joined by dotted rules with each label above its own number. Every number is a button; steps must stay reachable directly, not only through Next and Back.
- The first step carries only what the item needs to exist, so it can be saved without opening the rest. Every step stays at three controls or fewer, and Add and Edit use the same steps.
- Placement lives in one Order step and nowhere else. Do not scatter it across the other steps.
- The position always starts at the day's last activity, which is where a new item almost always belongs, and it is never a prerequisite for saving. The Order step therefore only appears when the day offers somewhere else to put the item — a day's first activity has exactly one position, so the step would be a tap that decides nothing.
- Steps are freely selectable, but leaving a step validates it: a missing required field blocks the switch and says why. Saving validates every step and jumps to the first that fails.
- The modal keeps one fixed height and Next/Back stay mounted and in place on the first and last step, so repeated clicks never chase a moving button. No step may add explanatory chrome — no shortcut legend, no restated step label, no preview card.
- Closing a modified editor — overlay click, close button, or Escape — must confirm before discarding.
- Field grouping and per-step validation live in `planner-item-form-steps.ts`. Cover changes with the step-grouping unit test instead of new source-text assertions.
- A bare Enter never saves. Enter is how a field is committed, so implicit form submission must stay suppressed for every control that is not a button, link, or textarea; Cmd/Ctrl+Enter remains the explicit save shortcut.

## Full-screen editor shell

- `.planner-item-dialog` is the shared shell for full-screen editors — the itinerary item editor and the trip editor both wear it. Size it in dynamic viewport units only. `vh` and `lvh` reach under the mobile browser toolbar, which repeatedly left the editor's bottom action row unscrollable and untappable.
- The shell owns exactly one vertical scroller. A pinned header must be a non-scrolling flex sibling of it, never a sticky child.
- Full-screen surfaces take `top: var(--visual-viewport-top, 0px)` and `height: var(--visual-viewport-height, 100dvh)` from `VisualViewportVars` in the root layout. Never pin one with `inset: 0` or a bare `100dvh` again, and always keep the `100dvh` fallback — the publisher withholds its keys under a pinch zoom or a zero-height report rather than collapsing everything that follows them.
- That is a deliberate surrender. iPadOS moves the page inside the layout viewport when its keyboard opens — even when the focused field is already visible — and `window.scrollY` reads 0 throughout. Preventing it and undoing it were both tried and both failed: document-scroll resets, rAF settle loops, root-height clamps, `interactive-widget=resizes-content` (iPad Chrome ignores the key), pinning the viewport scale (which made it move _further_), and a composer that lifted itself above the keyboard before focus. Following the offset is what works. `offsetTop` reaches ~111px while the keyboard is open and returns to 0 once it goes, so the movement is transient, not residual.
- `--visual-viewport-height` is the _window's_ height at its tallest reading, not `visualViewport.height`. Measured on an iPad: the visual viewport runs ~84px short of the window with no keyboard on screen at all, and `100dvh` follows it — that shortfall is the strip of blank page under the table, and what looked like a residual pan. Never publish a live per-frame height either; one transitional reading would shrink every surface.
- Nothing shrinks itself to the band the keyboard leaves. With the keyboard up that band is about 195px — one field, no form — so the keyboard is published as `--keyboard-inset` for surfaces that must sit above it, while a form keeps its full height and scrolls the focused field into view.
- Pinning the viewport scale (`minimum-scale=1, maximum-scale=1`) was tried against the zoom-to-fit that focus performs. It made the movement _worse_ — unable to change scale, iPadOS scrolls further to fit the field — so it is reverted. Do not reintroduce it, with or without `user-scalable=no`.
- Verify any keyboard change on a real iPad. A desktop browser at iPad size has no software keyboard and cannot reproduce any of this.

## Trip editor

- Creating a trip asks nothing at all. The New trip button creates it immediately — one day, `USD`, the browser's timezone, and the placeholder name `New trip yyyy-mm-dd` — then opens its plan. Never reintroduce a creation form, page, or dialog; a text field on the way in is what let the iPad keyboard poison the plan behind it.
- The first place written into a trip renames it, shortest honest name first: the place's locality, else the place itself. This only ever replaces the placeholder name, never one the traveller typed.
- Trip settings edit an existing trip only. `TripForm` therefore requires its `trip`, and `createTrip` takes no user input beyond what the browser knows.
- The screen has no steps and no Previous/Next, and one Save action commits. Trip name and Duration lead it, and neither types in place: the name opens the docked field, and the duration is a stepper whose value opens the docked field when an exact number is faster than tapping. Dates stay native pickers and currency stays a select, so nothing on this form can raise the keyboard over it.
- Timezone is neither asked for nor displayed. It is carried in a hidden field so existing trips keep theirs and new trips adopt the browser's.
- Renaming happens in a single field docked clear of the keyboard (`DockedFieldEditor`), reached from the trip menu — not in a form. It carries no keyboard arithmetic: the surface spans the window, follows the page with `--visual-viewport-top`, and holds `--keyboard-inset` of bottom padding. Guessing the keyboard's height and lifting the bar before focus was tried and lost the race. Never focus the field programmatically either — iPadOS refuses that outside a gesture, so the traveller's own tap has to be what opens the keyboard.
- Deleting a trip is reachable from the Trips list menu and from Trip settings. Both confirm first, and both say what published Share Pages the delete leaves online: settings already knows the count, the list asks for it as the confirmation opens.
- Dates and length describe the same trip. Committing either — on blur, not on every keystroke — settles the other, so a save can never be rejected for a range that disagrees with its length.

## Workspace clipboard boundary

- React replays events from portalled overlays through the workspace subtree. The planner's copy and paste handlers must ignore events whose target sits in an input, textarea, select, contenteditable, or dialog, so editing a field never rewrites Matrix cells.

## Place search field

- The place field owns its own input and suggestion list (`AutocompleteSuggestion.fetchAutocompleteSuggestions`). Do not go back to `PlaceAutocompleteElement`: its closed shadow root cannot be sized and it fills the whole screen on narrow viewports.
- Generate one session token per search session and drop it after `fetchFields`, and keep `includedPrimaryTypes` out of effect dependencies as an array — serialize it, or an inline array restarts the search on every render.

## Trip app bar

- The bar is one row: back, the trip identity (title plus active Plan), the contextual working actions, then one overflow menu. Never add a second bar beneath it; plan and table actions belong in the bar's action slot or in that menu.
- Section switching, Share, Trip settings, and account actions live in the same single menu. Never add a second overflow menu to the bar.

## Itinerary type scale

- The owner Matrix and the read-only Table share one scale, set once and only stepped at 1200px: 15px item titles with 13px meta below 1200px, 13px titles with 11px meta from 1200px up. Column headers track the meta size. Do not reintroduce `sm:`-prefixed downscaling.
- Density is tight at every width: compact row minimums, `p-0.5` cells, and no vertical rhythm added to compensate for the larger touch-width type. Item rows and app bar controls still keep a 44px target at touch widths.

## Public share dialog

- Publishing asks two questions — route and style. Everything else stays inside one collapsed Advanced settings disclosure.
- A published page always shows its URL with copy and open actions. When nothing has changed since the last publish, the primary action opens the page instead of publishing again.

## Tablet workspace containment and Matrix freezing

- Trip planner detail routes must occupy exactly one visual viewport. Keep the global header and planner toolbar pinned, prevent document-level vertical or horizontal scrolling, and let only the intended Matrix, panel, or overlay scroller move.
- Lock the owner planner route to the viewport at the root (`html`, `body`, trips shell, and planner page) instead of relying on a sticky toolbar inside a document scroller. The app bar and context bar must remain non-scrolling flex siblings of the workspace content.
- Every flex/grid child that owns the Matrix or map height must use `min-height: 0`; map panes must clip their contents. Do not fix bottom gaps with compensating margins, padding, or viewport-height guesses.
- Apply scroll containment and Safari compositing safeguards to the Matrix at every breakpoint. At a scroll boundary, continued touch movement must not rubber-band the frozen header, date/day columns, workspace shell, or expose blank space beyond the workspace.
- Verify owner planner behavior at 768px, 820px, and 1024px widths in both relevant orientations. Assert that `documentElement` and `body` do not exceed `innerHeight`, a forced `window.scrollTo` leaves `scrollY` at 0, the table/map reaches the viewport bottom (or the mobile tab bar top), and the app bar remains at top 0 while the Matrix scrolls in either axis.

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
