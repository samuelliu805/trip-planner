import type { IdeaClassification, IdeaKind } from "./idea-input.ts";
import type { IdeaUrlFields } from "./idea-url-fields.ts";

export function quickIdeaRouteLabel(
  preview: Pick<IdeaUrlFields, "originText" | "destinationText">,
  classification: Pick<IdeaClassification, "kind" | "provider">,
  carLabel: string,
) {
  const route =
    preview.originText && preview.destinationText && preview.originText !== preview.destinationText
      ? `${preview.originText} → ${preview.destinationText}`
      : preview.originText;
  return classification.kind === "car" && route
    ? `${classification.provider ?? carLabel} · ${route}`
    : route;
}

export function quickIdeaCaptureTitle(text: string, kind: IdeaKind, route: string | null) {
  if (text) return text.slice(0, 300);
  return ["car", "flight", "train"].includes(kind) ? null : route;
}
