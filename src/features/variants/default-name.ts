import type { Locale } from "@/features/i18n/config";
import type { PlannerVariant } from "@/features/itinerary/types";

const generatedVariantName = /^(?:route|方案)\s+([A-Z])$/iu;

export function nextVariantName(variants: Pick<PlannerVariant, "name">[], locale: Locale) {
  const used = new Set(
    variants.flatMap(({ name }) => {
      const suffix = name.trim().match(generatedVariantName)?.[1]?.toUpperCase();
      return suffix ? [suffix] : [];
    }),
  );
  const suffix = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").find((candidate) => !used.has(candidate));
  const prefix = locale === "zh-CN" ? "方案" : "Route";
  return suffix ? `${prefix} ${suffix}` : `${prefix} ${variants.length + 1}`;
}
