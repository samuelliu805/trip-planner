# Itinerary and Matrix invariants

## Itinerary item editor

- The editor is one progressive modal: a centred Dialog from 640px up, a full-height sheet below it. Do not reintroduce a side sheet for editing, and never show a workspace side panel next to the open editor.
- The step navigator is numbered circles joined by dotted rules with each label above its own number. Every number is a button; steps must stay reachable directly, not only through Next and Back.
- The first step carries only what the item needs to exist, so it can be saved without opening the rest. Every step stays at three controls or fewer, and Add and Edit use the same steps.
- Untimed Activities, Meals, and Car rentals show an Order step only when at least two legal positions exist. Entering a time or leaving only one position must remove that step immediately; the default position is after the day's last orderable activity and before a hotel.
- New Activities and Meals may offer Save and add another. Editing an existing item and every other category keep only the normal Save action.
- When an Order step exists, every earlier Save action becomes Confirm order and may only navigate to that final step. The actual Save and optional Save & create new actions live together there.
- Save, Confirm order, and Save & create new remain disabled while any required field is missing. Keep the click-time validation as a fallback, but do not make an invalid form look actionable.
- Freeze the Order preview to the items present when the editor opens. An optimistic create must never appear as both the moving item and another row with a misleading Move here action before the editor closes.
- Creating an Activity, Meal, Car rental, Hotel, or Transport saves directly without a second confirmation dialog. Report creation success or failure prominently; success must offer a link that closes the editor, selects the new item, scrolls it into view, and focuses it in the Matrix.
- Do not auto-focus a field when an itinerary editor first opens. Focus may move only after the user acts, such as choosing a place or following a newly-created-item link.
- New Activity creation begins with one intent-first `Activity or place` search. Keep the blank Activity name hidden until the user chooses a Google Maps result or commits the query as a custom activity; then reveal the shared name field. A place may update a blank or still-system-generated name, but must never overwrite a user-edited name.
- Steps are freely selectable, but leaving a step validates it: a missing required field blocks the switch and says why. Saving validates every step and jumps to the first that fails.
- The modal keeps one fixed height and Next/Back stay mounted and in place on the first and last step, so repeated clicks never chase a moving button. No step may add explanatory chrome — no shortcut legend, no restated step label, no preview card.
- Closing a modified editor — overlay click, close button, or Escape — must confirm before discarding.
- Field grouping and per-step validation live in `planner-item-form-steps.ts`. Cover changes with the step-grouping unit test instead of new source-text assertions.

## Reusable editor forms

- `PlannerEditorScreen`, `PlannerEditorHeader`, `PlannerEditorForm`, `PlannerEditorTextField`, and `PlannerEditorFormActions` are the shared primitives for planner text-input and edit experiences. Trip settings and itinerary items are the reference consumers.
- Build future editors by composing those primitives and supplying only their copy, fields, optional steps, and save handlers. Extend the shared props when a reusable capability is missing; do not fork the header, scroll shell, form spacing, text-field styling, keyboard behavior, or action layout.
- A variant may omit step navigation or add an explicit alternate save intent, but it must retain the same single scroller, field treatment, and form action behavior.

## Workspace clipboard boundary

- React replays events from portalled overlays through the workspace subtree. The planner's copy and paste handlers must ignore events whose target sits in an input, textarea, select, contenteditable, or dialog, so editing a field never rewrites Matrix cells.

## Itinerary type scale

- The owner Matrix and the read-only Table share one scale, set once and only stepped at 1200px: 15px item titles with 13px meta below 1200px, 13px titles with 11px meta from 1200px up. Column headers track the meta size. Do not reintroduce `sm:`-prefixed downscaling.
- Density is tight at every width: compact row minimums, `p-0.5` cells, and no vertical rhythm added to compensate for the larger touch-width type. Item rows and app bar controls still keep a 44px target at touch widths.

## Tablet workspace containment and Matrix freezing

- Trip planner detail routes must occupy exactly one visual viewport. Keep the global header and planner toolbar pinned, prevent document-level vertical or horizontal scrolling, and let only the intended Matrix, panel, or overlay scroller move.
- Lock the owner planner route to the viewport at the root (`html`, `body`, trips shell, and planner page) instead of relying on a sticky toolbar inside a document scroller. The app bar and context bar must remain non-scrolling flex siblings of the workspace content.
- Every flex/grid child that owns the Matrix or map height must use `min-height: 0`; map panes must clip their contents. Do not fix bottom gaps with compensating margins, padding, or viewport-height guesses.
- Apply Safari compositing safeguards to the Matrix at every breakpoint. Horizontal overscroll stays contained, but vertical scrolling at the Matrix or editor top boundary must hand off to the page/visual viewport so a keyboard-panned app bar can be restored from the main content area. The shell must still settle without exposing a persistent blank strip.
- Verify owner planner behavior at 768px, 820px, and 1024px widths in both relevant orientations. Assert that `documentElement` and `body` do not exceed `innerHeight`, a forced `window.scrollTo` leaves `scrollY` at 0, the table/map reaches the viewport bottom (or the mobile tab bar top), and the app bar remains at top 0 while the Matrix scrolls in either axis.

## Recurring tablet table regressions

- Treat any blank strip between an editable or read-only table and its bottom boundary as release-blocking. Bottom navigation that is already a flex sibling must not be compensated for with Matrix padding, spacer rows, margins, or viewport-height arithmetic.
- On tablet, a short table must fill the Matrix to its bottom boundary: distribute spare height across data rows instead of leaving an empty strip after the final row.
- Mobile and tablet bottom view navigation must span the full shell width as a non-scrolling flex sibling, not an overlay on the Table. At maximum Matrix scroll, the final row must terminate directly above it without padding, a blank strip, or a hidden overlap.
- The app bar/header and bottom navigation must be non-scrolling siblings of the table workspace. At tablet widths, only the Matrix owns content scrolling; a top-boundary gesture may recover a keyboard-panned visual viewport, after which `window.scrollY`, the app bar top, and the table workspace bottom must settle back to their fixed positions.
- A table header must meet the first data row with no spacer or unused row height. Assert that the first row's top equals the header's bottom within 1px in both editable and read-only tables.
- Frozen header cells and their body columns must share one explicit width and left offset. At 768px, 820px, and 1024px, assert that the first header cell and first body cell have matching `left`, `right`, and `width` values after horizontal scrolling.
- Verify these contracts on both the authenticated owner planner and a public read-only Table. For public pages, also open the Share dialog after every template-root positioning change; portal content must remain fixed, visible, and above all frozen layers.
