import type { PublicTemplateSourceV1 } from "../../schema.ts";
import { journalPublicTemplateSourceV1 } from "./source.ts";

export const journalPublicTemplateSourceV2 = {
  ...journalPublicTemplateSourceV1,
  assetIds: ["travel-desk", "paris-morning"],
  themeCss: journalPublicTemplateSourceV1.themeCss.replace(
    /font-family:[^;]+;/,
    "font-family: var(--font-journal-sans), sans-serif;",
  ),
  version: 2,
} satisfies PublicTemplateSourceV1;
