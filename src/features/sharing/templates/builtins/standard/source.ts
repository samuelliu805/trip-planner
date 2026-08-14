import type { PublicTemplateSourceV1 } from "../../schema.ts";

export const standardPublicTemplateSourceV1 = {
  assetIds: [],
  id: "standard",
  schemaVersion: 1,
  sourceMode: "theme",
  themeCss: `
tp-layout {
  color-scheme: light;
}
tp-region[name="header-actions"] {
  align-items: center;
  display: flex;
  gap: 0.5rem;
}
  `.trim(),
  version: 1,
} satisfies PublicTemplateSourceV1;
