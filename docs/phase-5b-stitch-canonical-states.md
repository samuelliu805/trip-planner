# Phase 5B Stitch canonical states

Google Stitch project: `17383404756727809214` (`Trip Planner — Implementation Blueprint`)

The screens below were present in and inspected from the linked Stitch project before Phase 5B implementation. Phase 4 and Phase 5A references remain in force for the surrounding planner shell.

| Screen title                                      | Screen ID                          | Stitch device type                            | State represented                                                                                    | Implementation mapping                                                                          |
| ------------------------------------------------- | ---------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Phase 5B — Route Variant Map Comparison · Desktop | `c50f1de257ce4ef4a9c946c8330a0883` | Desktop                                       | Desktop comparison map with all variants visible and the active route emphasized                     | `PlannerMapShell`, `RouteVariantComparisonPanel`, and provider-neutral comparison markers/lines |
| Trip Planner - Route Variant Comparison           | `17c12455ff594faea6ef18e85e7fe278` | Desktop                                       | Canonical floating legend with visibility, identity, Primary, Active/Preview, and City sequences     | `RouteVariantComparisonPanel` and `useVariantComparison` visibility state                       |
| Trip Planner - Phase 5B Structural Comparison     | `9f5896447fdc4c178cb97c0e28c3ba98` | Desktop                                       | Compact structural summary with the active route visible and inactive routes hidden                  | Comparison visibility rows and `No City stages` structural state                                |
| TripArchitect - Planner                           | `85280b7acc184547818d63efd044466e` | Desktop                                       | Compare disabled for one variant and while a Day route draft is open                                 | `PlannerMapControls`, mobile `RouteVariantSwitcher`, and the existing Day route editing state   |
| Trip Planner - Compare Routes                     | `4d7c3cccfa0a46c6b906ff6ecb8f2f12` | Desktop metadata; portrait-tablet composition | Portrait-tablet bottom Sheet, active/editing card, and one selected preview                          | Source for `RouteVariantComparisonSheet`; visibility controls replace one-route preview         |
| Route Comparison - TripArchitect                  | `9a3784c490b94bd5bf8542a434540e74` | Mobile                                        | Mobile comparison Sheet over the Matrix/map peek with vertical route cards and 44px actions          | `RouteVariantComparisonSheet`, mobile route control, and preserved Matrix/map peek              |
| Phase 5B — Route Variant Preview · Mobile Browser | `7d03eb27d98e458591e048b2f7e2b553` | Mobile                                        | One inactive route previewed on the map with persistent Previewing/Editing context and return action | Source for mobile context; user-directed multi-route parity supersedes the one-preview behavior |

## Interaction and responsive contract

- At 900px and wider, the Matrix remains visible and editable for the URL-selected variant while the map overlays every locally visible comparison projection. The active route is always visible, uses the strongest line/marker treatment, and renders above inactive routes.
- The floating desktop legend pairs stored color with variant name and textual Primary, Editing/Read only, Visible/Hidden, and City-sequence states. Its single close action exits comparison and returns to normal active-variant Overview.
- Below 900px, the expanded map uses the same visible multi-variant overlay as desktop. A single **Routes** control opens the visibility Sheet; the compact context says which route the Matrix edits and that the map is read only. Opening or filtering comparison never updates the URL or active Matrix.
- Comparison is unavailable with fewer than two variants. When a Day route editor contains its open draft, comparison is disabled with an explicit instruction to save or discard it first; the mutable editor is never hidden behind comparison.
- Loading and failure are isolated to the map/Sheet. The Matrix remains usable, failures offer Retry, and a variant without persisted place-linked Cities remains listed as `No City stages`.

## Surrounding canonical references inspected

- Phase 5A variant-state board: `2c1a146843e84c609a5b317d49df6af8`
- Phase 4 desktop Overview: `a4aff9d4ef634fd6966afd4497beee45`
- Phase 4 mobile Overview: `40c5d98d36e249b5a872cb39244ac334`
- Phase 4 tablet split: `c8c8e161e17b4a9e9bf8acd7cc910a18`
- Phase 4 desktop Day route View: `213baa2d898e498f922d568d50e56e42`
- Phase 4 desktop Day route Edit: `e458029f49c54e3aa088d98a0ea3b99d`
- Phase 4 mobile Day route: `a5101f74ec9243e68f0367d0b5e4ddc8`

## Deliberate deviations

1. Some generated comparison screens show distance, duration, logistics, nights, or similar decision metrics. Those controls and values are omitted because they belong to Phase 5C; Phase 5B shows only variant identity, primary/editing/read-only/visibility state, and explicit City sequence.
2. Some generated examples depict curved or solid route geometry. Every implemented comparison line is a dashed, straight, two-coordinate preview. This gives every variant the same basis and guarantees comparison never uses Google Routes, session-calculated Overview geometry, or persisted Day route geometry.
3. After implementation review, mobile and portrait tablet use the same multi-variant overlay as desktop instead of Stitch's one-route preview. This user-directed deviation removes the separate preview state, makes visibility behavior consistent across viewports, and keeps the Matrix/URL bound to the active route.
4. Stitch records the portrait-tablet comparison screen as `DESKTOP`. The composition itself is implemented at the repository's established portrait breakpoint (below 900px), while landscape tablets retain the Matrix-plus-map overlay.
5. The generated active/preview labels are normalized to `Editing` and `Read only`. The compact mobile context states `Matrix: … · Map: read only`, so there is no second preview identity to confuse with the editable URL route.
6. The desktop legend's separate hide/reopen controls were removed after implementation review because they duplicated the nearby close action. The remaining close button exits comparison; mobile **Routes** opens and closes only its visibility controls.

No Phase 4 or Phase 5A canonical reference was overwritten.
