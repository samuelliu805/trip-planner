# Trip shell invariants

## Trip App Bar

- The bar is one row: back, the trip identity (title plus active Plan), the contextual working actions, then one overflow menu. Never add a second bar beneath it; plan and table actions belong in the bar's action slot or in that menu.
- Section switching, Share, Trip settings, and account actions live in the same single menu. Never add a second overflow menu to the bar.

## Owner workspace containment

- The app bar and context bar are non-scrolling flex siblings of the workspace. The planner detail route owns exactly one visual viewport and document-level horizontal or vertical scrolling stays disabled.
- Every flex/grid child that owns Matrix or map height uses `min-height: 0`; map panes clip their contents. Do not compensate for bottom gaps with margins, padding, spacer rows, or viewport-height arithmetic.
- At 768px, 820px, and 1024px in both relevant orientations, the app bar remains at top 0, the workspace reaches its bottom boundary, `window.scrollY` settles at 0, and only the intended Matrix or panel scroller moves.
