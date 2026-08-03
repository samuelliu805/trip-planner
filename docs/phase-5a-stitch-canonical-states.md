# Phase 5A Stitch canonical states

Phase 5A keeps the existing Phase 4 planner shell, Matrix, map, Overview, and Day route panels. The canonical Phase 4 Stitch references remain the visual baseline:

- Desktop Day route View: `213baa2d898e498f922d568d50e56e42`
- Desktop Day route Edit: `e458029f49c54e3aa088d98a0ea3b99d`
- Mobile Day route: `a5101f74ec9243e68f0367d0b5e4ddc8`
- Desktop Overview: `a4aff9d4ef634fd6966afd4497beee45`
- Mobile Overview: `40c5d98d36e249b5a872cb39244ac334`
- Tablet compact split: `c8c8e161e17b4a9e9bf8acd7cc910a18`

The Stitch project was accessible during Phase 5A implementation. A request to add a generated canonical-state board timed out with HTTP 504 and no new screen appeared in the project, so the following implementation contract documents the required states without replacing the Phase 4 references.

## Desktop active variant selector

- Place a compact trigger in the existing planner header beside the trip identity.
- Show a color dot, active variant name, a neutral text `Primary` badge when applicable, and a chevron.
- Keep `New route` and an overflow management action compact; do not add a permanent sidebar or increase Matrix toolbar height.
- The open menu lists every variant by color dot and name, with `Primary` represented in text rather than color.

## Desktop Create route dialog

- Ask for a trimmed unique name and one color from the fixed named palette.
- Offer `Blank route` and `Duplicate route`; duplication includes a source selector and a summary stating that days, items, links, saved stops, and leg modes are copied while calculations are not.
- State the three-variant maximum and disable submission while an operation is pending.

## Desktop Manage variants dialog

- List at most Route A, Route B, and Route C with color dot, name, and a separate `Primary` badge.
- Provide Rename, Change color, Set primary, Duplicate, and Delete actions.
- Explain why Delete is unavailable for the primary or final remaining variant.

## Mobile variant switcher Sheet

- Keep a compact trigger reachable in the planner header and show only one active variant in the Matrix and map.
- Open switching and management in a bottom Sheet with at least 44px touch targets.
- List each variant by color dot, name, and separate `Primary` text; include `New route` and compact management actions.
- Preserve the existing horizontally scrollable Matrix, 100px map peek, and expanded map Sheet behavior behind the variant Sheet.

## Delete confirmation

- Use an AlertDialog, never native `window.confirm`.
- State that the selected variant's days, itinerary items, and saved day routes will be deleted.
- State that trip-level shared places remain available to other variants.
- Provide Cancel and a destructive action labeled with the variant name.

## Shared interaction rules

- Switching uses `/trips/[tripId]?variant=[variantId]` and preserves browser Back/Forward behavior.
- Color communicates identity only and is always paired with a variant name.
- Create, duplicate, switch, rename, recolor, set-primary, and delete never calculate routes.
- Phase 5A shows no multiple Matrix panes, map overlays, comparison summaries, Google alternatives, merging, sharing, or export.
