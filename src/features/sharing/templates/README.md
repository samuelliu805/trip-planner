# Built-in public templates

V1 templates are trusted, static repository sources. Requests never read this directory or compile
templates; `registry.ts` imports generated artifacts directly.

## Add a template

1. Add `builtins/<id>/source.ts`. Use `sourceMode: "theme"` for `default-layout-v1`, or provide one
   declarative layout containing only `tp-layout`, `tp-region`, and `tp-part`. Keep the template's
   presentation CSS beside its source and expose it through `builtins/<id>/index.css`.
2. Add the source to `scripts/public-template-build-lib.mjs` and the generated artifact to
   `registry.ts`. If owners can select it, add its immutable id/version pair to the next forward
   management-RPC migration. Do not expand the Standard/Bento-only legacy query allow-list.
3. Run `npm run build:public-templates`, then add visual coverage for Standard/Bento parity and the
   new template at the supported widths.

Published `<id>@<version>` source and digest are immutable. Change presentation by publishing a new
version. Do not add data loading, handlers, navigation, Table/Map selectors, or selection logic to a
template; add a generic platform part contract first if a future design cannot be expressed with the
existing parts.

## Operations

- `PUBLIC_TEMPLATE_DISABLED_KEYS=bento@1,journal@1` disables registry keys at resolution time.
- `PUBLIC_TEMPLATE_RUNTIME_V1=0` forces the legacy `standard@1` fallback and retained CSS branch.
- Unknown, disabled, or invalid artifacts resolve to Ethereal, then Standard, with structured server
  diagnostics instead of a blank page.
