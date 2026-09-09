import type { PublicTemplateSourceV1 } from "../../schema.ts";
import { neonPublicTemplateSourceV1 } from "./source.ts";

export const neonPublicTemplateSourceV2 = {
  ...neonPublicTemplateSourceV1,
  assetIds: ["paris-morning", "seine-route"],
  themeCss: neonPublicTemplateSourceV1.themeCss.replace(
    /font-family:[^;]+;/,
    "font-family: var(--font-journal-sans), sans-serif;",
  ),
  version: 2,
} satisfies PublicTemplateSourceV1;
