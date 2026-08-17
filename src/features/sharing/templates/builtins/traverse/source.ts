import type { PublicTemplateSourceV1 } from "../../schema.ts";

const traversePublicTemplateLayout = `
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

export const traversePublicTemplateSourceV1 = {
  assetIds: [],
  id: "traverse",
  layoutHtml: traversePublicTemplateLayout,
  schemaVersion: 1,
  sourceMode: "layout",
  themeCss: `
tp-layout {
  --accent: #d7e3e4;
  --accent-foreground: #12313d;
  --background: #eef2f0;
  --border: rgba(17, 38, 45, 0.25);
  --card: #f8faf7;
  --card-foreground: #172024;
  --foreground: #172024;
  --input: rgba(17, 38, 45, 0.35);
  --muted: #dce6e5;
  --muted-foreground: #5d6b70;
  --popover: #f8faf7;
  --popover-foreground: #172024;
  --primary: #f05a28;
  --primary-foreground: #ffffff;
  --radius: 0.25rem;
  --ring: #f05a28;
  --secondary: #12313d;
  --secondary-foreground: #eef2f0;
  background: #eef2f0;
  color: #172024;
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
