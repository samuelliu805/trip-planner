import { z } from "zod";

import { canonicalPublicViews } from "./schema.ts";
import type { PublicView } from "./types.ts";

export const canonicalPublicTemplates = ["standard", "bento"] as const;
export type PublicTemplate = (typeof canonicalPublicTemplates)[number];
export const defaultPublicTemplate: PublicTemplate = "standard";

const publicTemplateSchema = z.enum(canonicalPublicTemplates);
const publicQueryViewSchema = z.enum(canonicalPublicViews);

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function publicShareUrlState(
  search: Record<string, string | string[] | undefined>,
  savedDefaultView: PublicView,
) {
  const template = publicTemplateSchema.safeParse(first(search.template));
  const view = publicQueryViewSchema.safeParse(first(search.view));
  return {
    template: template.success ? template.data : defaultPublicTemplate,
    view: view.success ? view.data : savedDefaultView,
  };
}
