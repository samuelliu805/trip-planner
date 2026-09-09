import type { PublicTemplateSourceV1 } from "../../schema.ts";
import { traversePublicTemplateSourceV1 } from "./source.ts";

export const traversePublicTemplateSourceV2 = {
  ...traversePublicTemplateSourceV1,
  assetIds: ["seine-route", "travel-desk"],
  themeCss: traversePublicTemplateSourceV1.themeCss.replace(
    /font-family:[^;]+;/,
    "font-family: var(--font-journal-sans), sans-serif;",
  ),
  version: 2,
} satisfies PublicTemplateSourceV1;
