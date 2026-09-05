# Place search invariants

- The place field owns its own input and suggestion list (`AutocompleteSuggestion.fetchAutocompleteSuggestions`). Do not go back to `PlaceAutocompleteElement`: its closed shadow root cannot be sized and it fills the whole screen on narrow viewports.
- The shared place search may expose a custom-value option, but that option must remain inside the same keyboard-reachable listbox. Enter commits the custom value only when no suggestion is active; it never submits the surrounding editor.
- Every Google or custom suggestion must select with one click or tap. Use click semantics that survive the search input losing focus; do not require a preliminary focus tap.
- Generate one session token per search session and drop it after `fetchFields`, and keep `includedPrimaryTypes` out of effect dependencies as an array — serialize it, or an inline array restarts the search on every render.
