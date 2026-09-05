# Workspace implementation invariants

These rules apply throughout the repository. More detailed invariants live in scoped `AGENTS.md`
files and apply automatically when work enters their directory:

- `src/app`: route stability and viewport-owning workspace CSS.
- `src/features/itinerary`: Matrix behavior and the progressive itinerary editor.
- `src/features/places`: shared place search behavior.
- `src/features/sharing`: public pages, maps, tables, and publishing.
- `src/features/trips`: the Trip App Bar and owner workspace shell.
- `scripts` and `.github`: validation, E2E safety, and exact-SHA CI gates.

## Validation strategy

- Preserve every assertion and release-blocking workflow, but run the narrowest relevant gate while implementing.
- A local pass is reusable only for the exact worktree, Node version, dependency install, and non-secret provider-selector fingerprint. Never reuse live tests against mutable external state.
- Do not rerun an unchanged deterministic gate. After a failure, rerun the smallest failing stage, then the affected regional suite once after the fix.
- Run full Global and CN live E2E for cross-region, database, auth, routing, maps, sharing, release-wide work, or an explicit full-regression request. Leaf changes use their targeted unit and browser coverage.
- An equivalent required CI gate on the exact candidate SHA replaces a duplicate local full run. Never merge until the required matrix, cleanup, and residue audit are green.
- Successful validation commands emit compact stage summaries and retain complete private logs. Show bounded diagnostic output only when a stage fails.

## Overlay and frozen-layer stacking

- Keep normal workspace content, sticky headers, and frozen Matrix columns at `z-index: 80` or lower.
- Render Dialog and Sheet overlays at `z-index: 100` or higher, their content at `110` or higher, nested Select/Dropdown content at `120` or higher, nested confirmation dialogs at `130` or higher, and tooltips at `150` or higher.
- Never raise a table header, frozen column, map control, or other workspace element above a modal overlay to fix a local stacking bug.

## Mobile overlays

- Dialogs and Sheets must fit inside the visual viewport, use `max-width: 100%`, prevent horizontal overflow, and have one intentional vertical scroller.
- Controls must shrink within their grid or flex container (`min-width: 0`) and retain 44px minimum touch targets.
- Verify modal and Sheet behavior at both 390px and 430px widths. Opening an overlay must cover every frozen Matrix layer, and the page beneath it must not horizontally swipe.

## Production file size

- Keep manually maintained production files focused and at or below 300 lines when practical. When a UI component or stylesheet grows past 300 lines, split it by responsibility instead of adding another section; generated types and comprehensive test suites are exempt.
