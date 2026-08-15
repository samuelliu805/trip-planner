import type { PublicTemplateSourceV1 } from "../../schema.ts";

const journalPublicTemplateLayout = `
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

export const journalPublicTemplateSourceV1 = {
  assetIds: [],
  id: "journal",
  layoutHtml: journalPublicTemplateLayout,
  schemaVersion: 1,
  sourceMode: "layout",
  themeCss: `
tp-layout {
  --accent: #dfe9df;
  --accent-foreground: #49634f;
  --background: #fbf7ec;
  --border: #d7ccba;
  --card: #fffdf7;
  --card-foreground: #2d352f;
  --foreground: #2d352f;
  --input: #cbbda7;
  --muted: #f4eddd;
  --muted-foreground: #6f756e;
  --popover: #fffdf7;
  --popover-foreground: #2d352f;
  --primary: #718c73;
  --primary-foreground: #fffdf7;
  --radius: 0.75rem;
  --ring: #6f9fbb;
  --secondary: #f4eddd;
  --secondary-foreground: #2d352f;
  background: #fbf7ec;
  color: #2d352f;
  color-scheme: light;
  font-family: ui-rounded, "Avenir Next", "Segoe UI", sans-serif;
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
