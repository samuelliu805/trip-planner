# Google Places session invariants

- The shared place search owns its suggestion list through `AutocompleteSuggestion.fetchAutocompleteSuggestions`; do not reintroduce `PlaceAutocompleteElement`.
- Generate one session token per search session and drop it after `fetchFields`.
- Keep `includedPrimaryTypes` out of effect dependencies as an array. Serialize it so an inline array cannot restart the search on every render.
