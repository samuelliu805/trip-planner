import type { PublicTemplateSourceV1 } from "../../schema.ts";

const editorialPublicTemplateLayout = `
<tp-layout>
  <tp-region name="header">
    <tp-region name="brand-row">
      <tp-part name="trip-header" />
      <tp-region name="header-actions">
        <tp-part name="desktop-map-toggle" />
        <tp-part name="viewer-share-dialog" />
      </tp-region>
    </tp-region>
  </tp-region>
  <tp-region name="view-navigation">
    <tp-part name="view-switcher" />
  </tp-region>
  <tp-region name="workspace">
    <tp-region name="content">
      <tp-part name="active-view" />
    </tp-region>
    <tp-part name="map-workspace" />
  </tp-region>
  <tp-region name="mobile-overlays">
    <tp-part name="mobile-map-trigger" />
    <tp-part name="mobile-map-sheet" />
  </tp-region>
</tp-layout>
`.trim();

export const etherealPublicTemplateSourceV1 = {
  assetIds: [],
  id: "ethereal",
  layoutHtml: editorialPublicTemplateLayout,
  schemaVersion: 1,
  sourceMode: "layout",
  themeCss: `
tp-layout {
  --accent: #e4e8e3;
  --accent-foreground: #303531;
  --background: #f8f7f3;
  --border: rgba(50, 51, 47, 0.13);
  --card: #fffefa;
  --card-foreground: #191a18;
  --foreground: #191a18;
  --input: rgba(50, 51, 47, 0.23);
  --muted: #efede7;
  --muted-foreground: #77766f;
  --popover: #fffefa;
  --popover-foreground: #191a18;
  --primary: #667169;
  --primary-foreground: #fffefa;
  --radius: 0.25rem;
  --ring: #a68d62;
  --secondary: #eee7da;
  --secondary-foreground: #40392e;
  background: #f8f7f3;
  color: #191a18;
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}
tp-region[name="brand-row"] {
  align-items: center;
  display: flex;
  justify-content: space-between;
}
tp-region[name="header-actions"] {
  align-items: center;
  display: flex;
  gap: 0.5rem;
}
  `.trim(),
  version: 1,
} satisfies PublicTemplateSourceV1;
