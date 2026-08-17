export const defaultPublicTemplateLayoutV1 = `
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
`.trim();
