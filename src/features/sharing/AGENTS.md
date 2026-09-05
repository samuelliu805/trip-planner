# Public sharing invariants

## Public share dialog

- Publishing asks two questions — route and style. Everything else stays inside one collapsed Advanced settings disclosure.
- A published page always shows its URL with copy and open actions. When nothing has changed since the last publish, the primary action opens the page instead of publishing again.

## Public map synchronization

- Change content-to-map selection only after an explicit click or Enter/Space activation. Hover and focus alone must never move or rescope the map.
- Keep marker-to-content selection explicit on marker click, with scroll/focus restoration and no owner-data mutation.

## Public itinerary information hierarchy

- Transport type and short name labels (for example, Flight, Train, or Car rental) must remain fully visible on one line in Overview, Table, and Timeline at every breakpoint. Never truncate or ellipsize these labels; wrap or resize the surrounding layout first, while keeping route, service number, schedule, place, and notes available as supporting detail.
- Never show a generic placeholder such as `Field` when the itinerary category is known. Display the real category label or omit that label and promote the item title.
- In Overview, present multiple transport entries as one compact grouped information band with separators instead of giving each transport the visual weight or vertical footprint of a standalone item card.

## Public tablet tables

- Treat any blank strip between a read-only table and its bottom boundary as release-blocking. Bottom navigation that is already a flex sibling must not be compensated for with Matrix padding, spacer rows, margins, or viewport-height arithmetic.
- On tablet, a short table fills its Matrix to the bottom boundary by distributing spare height across data rows. The final row terminates directly above full-width bottom navigation without padding, a blank strip, or hidden overlap.
- The app bar/header and bottom navigation are non-scrolling siblings of the table workspace. Only the Matrix owns content scrolling, and after keyboard-panned viewport recovery `window.scrollY`, the app bar top, and workspace bottom settle back to their fixed positions.
- The table header meets the first data row with no spacer; assert their boundaries differ by no more than 1px.
- Frozen header cells and body columns retain matching `left`, `right`, and `width` after horizontal scrolling at 768px, 820px, and 1024px.
- After template-root positioning changes, verify the public Table and open the Share dialog; its portalled content remains fixed, visible, and above every frozen layer.
