# Nonblocking editing with the original editing flow

This follow-up restores explicit Save, required-field step validation, Confirm order, and Exit without saving. It removes Quick edit and normal draft badges/actions. Itinerary and Ideas retain their existing unsaved-exit confirmation; settings and Plan editors retain fields on close without adding a confirmation flow. Durable raw-field recovery and accepted-operation outboxes remain internal; background ACKs, failures and conflicts keep their existing ownership and recovery guarantees.

At desktop widths of 1200px and above, itinerary editing reuses the existing right map pane and draggable divider. Map/Edit buttons switch that pane without unmounting the form. Opening another event from the Plan returns the pane to Edit; previous unsaved fields remain recoverable. Closing or saving restores the full map. The left Plan remains interactive. Smaller screens retain the existing focused modal. Trip settings, Ideas and Plan metadata retain their original modal surfaces.

Right-click menus on day headers and every day cell expose Reorder day events, enabled when that day has multiple activities. Timed anchors retain their existing protections. The Primary badge stays on one line while long Plan names truncate.

The NZ trip's last-day saved positions put AKL→SHA at 21:20 before CHC→AKL at 14:05. Presentation now sorts complete flight cards by departure date/time as well as their endpoint activities, preserving unrelated activity gaps and stored positions. Public presentation also orders flight cards by available departure time. No data migration or rewrite is required.

## Verification

Targeted browser checks passed for delayed saves, independent edits, HTTP 409 recovery, explicit settings saves, pending Idea edits and identity binding, raw input across reload, Map/Edit switching, the NZ legacy ordering, and Primary badge widths of 390/430/1280px. Editor containment passed at 390/430/768/820/1024px. The actual Guest route passed offline Save, Save & create new, recovery, Confirm order, both context-menu entry points, and map-pane geometry/switching. Input-to-frame p95 was 1.4ms under delayed persistence in the controlled browser run.

Six flight-order behavior tests cover overnight/date-line endpoints, complete flight cards, owner/public consistency and preserved ordinary activity gaps. Required CI runs the complete editing/upload browser suites, Guest route, four PostgreSQL 17 migration chains, sharing/export Chromium and WebKit checks, and full Global/CN real-provider acceptance. Exact-source Preview and CN development deployment checks, fixture cleanup and independent residue audits must pass before merging. Final immutable release evidence is recorded in the PR checks; local controlled tests do not claim live-provider coverage.
