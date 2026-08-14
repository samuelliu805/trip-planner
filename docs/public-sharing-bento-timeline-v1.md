# Public sharing: Bento + Timeline v1

- Public presentation templates are URL-addressable. The existing light template remains the default as `?template=standard`; the prototype-matched dark Bento treatment is opt-in as `?template=bento`. The canonical template list is intentionally small and extensible.
- Every public view has its own canonical query URL: `?view=overview`, `?view=table`, or `?view=timeline`. When the query is absent, the saved link default is honored and then written to the URL. The viewer share action preserves both parameters.
- Timeline is the preferred default for newly created share settings. Existing links continue to honor their saved `defaultView`; Overview, Table, and Timeline remain canonical.
- Overview is a media-aware, row-major Bento board. Media belongs to an itinerary item, manual item order remains canonical, and only one multi-media item is featured per day by default.
- Each Day renders at most one cover image. Explicit attachment imagery has first priority; otherwise the first manually ordered untimed Activity with a Google place is preferred, followed by timed Activity, Hotel, Meal, and other place-backed items. PDFs remain item-attached and visible. Google lookup is capped to the selected cover candidate for each Day.
- Timeline is the journey view: one bounded Day section, compact major-transport context in the header, and ordered event nodes. Saved route-leg details remain in the map workspace and are not inserted between Timeline nodes.
- Table keeps the existing one-row-per-day Matrix information architecture and sticky/horizontal-scroll behavior.
- Google Place imagery is optional, resolved from existing Google place IDs on the server, attributed in the UI, and omitted on any lookup/configuration failure.
- Generic itinerary attachment persistence does not currently exist. The public media model supports future image/PDF attachments, but upload/storage policy is a separate phase.
- The existing desktop split map, mobile map Sheet, public-token authorization, and shared selection state are unchanged.
- Bento maps use the same `#58f58b` accent for route geometry and markers, with dark glyphs for contrast. Bento images use restrained desaturation, contrast, brightness, and vignette filters rather than destructive blur.
- Public view switching and the owner mobile Plan / Ideas & Options navigation use the same accessible full-width bottom-navigation primitive, flush to the viewport edge with only a top border.
