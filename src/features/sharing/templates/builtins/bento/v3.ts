import type { PublicTemplateSourceV1 } from "../../schema.ts";
import { bentoPublicTemplateSourceV2 } from "./v2.ts";

export const bentoPublicTemplateSourceV3 = {
  ...bentoPublicTemplateSourceV2,
  assetIds: ["paris-morning", "travel-desk"],
  themeCss: bentoPublicTemplateSourceV2.themeCss.replace(
    /font-family:[^;]+;/,
    "font-family: var(--font-journal-sans), sans-serif;",
  ),
  version: 3,
} satisfies PublicTemplateSourceV1;
