# Phase 5C Stitch canonical states

Google Stitch project: 17383404756727809214 (Trip Planner — Implementation Blueprint)

The eight screens below were present in and inspected from the linked Stitch project before Phase 5C implementation. Phase 4, Phase 5A, and Phase 5B references remain in force for the surrounding planner, variant, map, and comparison behavior.

| Screen title                                                    | Screen ID                        | Device type | State represented                                                                                                                                  | Implementation mapping                                                                                |
| --------------------------------------------------------------- | -------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Phase 5C — Decision Summary · Load-Failure State                | bbfa9bff013747c0ad5058c1db5b20ce | Desktop     | The decision-summary request fails while the Matrix and existing comparison remain usable; Retry is isolated to the summary                        | DecisionSummaryFeedback, RouteVariantDecisionSummaryPanel, and the independent decision-summary query |
| Phase 5C — Decision Summary · Desktop · Summary Collapsed       | 4c04c7e32b8a4858805e576c9546b2c4 | Desktop     | Comparison remains visible with a compact Decision summary action and no permanent loss of map space                                               | RouteVariantComparisonPanel and decisionSummaryPanelOpen in usePlannerMap                             |
| Phase 5C — Decision Summary · One-Variant Disabled State        | 1fee9a9d458b4b8f8123d66fbdf910a8 | Desktop     | Decision summary is unavailable until another Route Variant exists                                                                                 | useVariantComparison blocking reason and the desktop/mobile Compare controls                          |
| Phase 5C — Decision Summary · Desktop · Summary Expanded        | 4743d4bcdb8047a1b6838da8f873fc31 | Desktop     | A compact, collapsible summary presents at most three variant columns with Primary as the baseline and the active route labeled Editing            | RouteVariantDecisionSummaryPanel and DecisionSummaryCard                                              |
| Phase 5C — Decision Summary · Mobile · Summary Sheet            | 6a42a14ab8ef44b68f54c02d277e5521 | Mobile      | A dedicated bottom Sheet presents stacked variant cards without replacing the horizontally scrollable Matrix, map peek, or Routes visibility Sheet | RouteVariantDecisionSummarySheet, VariantComparisonMobileBar, and PlannerSheets                       |
| Phase 5C — Decision Summary · Desktop · Partial & Unknown State | 4bce4c12ffa74028b6c90d0f69ed86bd | Desktop     | Comparable incomplete dates, missing calculations, stale routes, and excluded per-mode distance totals are explicit                                | DecisionSummaryCard, CoverageDetails, and pure route/horizon derivation                               |
| Phase 5C — Decision Summary · Desktop · Hotel Difference Detail | 417a22cddc354284a2d5060f89d93865 | Desktop     | Hotel occurrence differences expand against Primary with same, changed, added, removed, and affected date/day detail                               | compareHotelOccurrences and HotelDetails                                                              |
| Phase 5C — Decision Summary · Mobile · Partial/Unknown State    | b4c4b6b61e7f4454b31f5b9a1196d912 | Mobile      | The mobile Sheet retains explicit comparable unknown, stale, and not-calculated language while suppressing metrics unknown for every variant       | RouteVariantDecisionSummarySheet and DecisionSummaryCard                                              |

## Responsive and interaction contract

- At 900px and wider, the active URL-selected Matrix keeps its established minimum width and remains editable. Decision summary expands as a collapsible overlay within the map area; the comparison legend and map remain available, and collapse restores the full map.
- Below 900px, the Matrix remains horizontally scrollable with its 100px map peek. The expanded comparison map retains separate Summary and Routes actions. Summary opens its own bottom Sheet, and closing it returns to the comparison map.
- The Primary variant is always the stable baseline. Every non-primary card says vs Primary; the active card says Editing and every inactive card says Read only. Stored color is supplemental and never the only identity.
- Loading and failure are scoped to the summary. Retry refetches only persisted summary facts. Opening, retrying, or expanding details never changes the URL, switches the active variant, invokes Place Details, or calculates a route.
- Route coverage and Hotel occurrence detail use native expandable controls with keyboard focus, a minimum 44px target, textual status, and no color-only meaning.

## Deliberate deviations

1. Generated Stitch examples that imply switching to or editing an inactive route are not implemented. Phase 5A establishes one URL-selected editable Matrix; inactive variants remain read only.
2. Generated winner, confidence, score, recommendation, weather, recalculate, route-alternative, and similar evaluative controls are omitted. Phase 5C reports persisted facts without ranking or inference.
3. Generated share/export actions are omitted because they belong to Phase 6.
4. Mock metric labels and values were normalized to the mandatory Phase 5C definitions. In particular, City span is straight-line only, saved route-mode distance includes only current signatures, and Hotel occurrences are never presented as inferred nights.
5. No baseline selector was added. Primary remains the stable comparison baseline.
6. Desktop uses compact rows and expandable detail inside the existing map area instead of oversized dashboard cards. This preserves the established Matrix minimum and comparison-map utility.
7. Stitch desktop images are 2560×2048 references; implementation follows the repository breakpoint contract: desktop/tablet landscape at 900px and wider, portrait tablet/mobile below 900px.
8. A subsequent product review simplified the summary: displayed City sequences collapse adjacent repeats of the same normalized place while stage counts remain occurrence-based; aggregate Day-route distance and duration are replaced by explicit saved-mode distances; and metrics unknown for every compared variant are omitted. This changes presentation only and preserves the accepted projection integrity and no-automatic-calculation rules.

No Phase 4, Phase 5A, or Phase 5B canonical reference was overwritten.
