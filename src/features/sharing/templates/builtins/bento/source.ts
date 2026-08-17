import type { PublicTemplateSourceV1 } from "../../schema.ts";

export const bentoPublicTemplateSourceV1 = {
  assetIds: [],
  id: "bento",
  layoutHtml: `
<tp-layout>
  <tp-region name="header">
    <tp-part name="trip-header" />
    <tp-region name="header-actions">
      <tp-part name="desktop-map-toggle" />
      <tp-part name="viewer-share-dialog" />
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
  `.trim(),
  schemaVersion: 1,
  sourceMode: "layout",
  themeCss: `
tp-layout {
  --accent: #172b20;
  --accent-foreground: #f2f8f3;
  --background: #07110b;
  --border: #2b3d31;
  --card: #0b1710;
  --card-foreground: #f2f8f3;
  --foreground: #f2f8f3;
  --input: #405a48;
  --muted: #0f1d14;
  --muted-foreground: #a7b5aa;
  --popover: #0f1d14;
  --popover-foreground: #f2f8f3;
  --primary: #58f58b;
  --primary-foreground: #06100a;
  --public-blue: #9fc9ff;
  --public-gold: #ffe3a3;
  --public-peach: #ffd4bb;
  --public-subtle: #748178;
  --radius: 0.875rem;
  --ring: #58f58b;
  --secondary: #13231a;
  --secondary-foreground: #e1ece3;
  background: #07110b;
  color: #f2f8f3;
  color-scheme: dark;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}
tp-region[name="header-actions"] {
  align-items: center;
  display: flex;
  gap: 0.5rem;
}
  `.trim(),
  version: 1,
} satisfies PublicTemplateSourceV1;
