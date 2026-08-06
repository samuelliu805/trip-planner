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

## Public map synchronization

- Change content-to-map selection only after an explicit click or Enter/Space activation. Hover and focus alone must never move or rescope the map.
- Keep marker-to-content selection explicit on marker click, with scroll/focus restoration and no owner-data mutation.
