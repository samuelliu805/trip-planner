import type { PublicTemplateSourceV1 } from "../../schema.ts";
import { etherealPublicTemplateSourceV1 } from "./source.ts";

export const etherealPublicTemplateSourceV2 = {
  ...etherealPublicTemplateSourceV1,
  assetIds: ["seine-route", "paris-morning"],
  themeCss: etherealPublicTemplateSourceV1.themeCss.replace(
    /font-family:[^;]+;/,
    "font-family: var(--font-journal-sans), sans-serif;",
  ),
  version: 2,
} satisfies PublicTemplateSourceV1;
