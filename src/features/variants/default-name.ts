import type { Locale } from "@/features/i18n/config";
import type { PlannerVariant } from "@/features/itinerary/types";

const generatedVariantName = /^(?:route|方案)\s+([A-Z])$/iu;

export function clonedVariantName(sourceName: string, variants: Pick<PlannerVariant, "name">[]) {
  const used = new Set(variants.map(({ name }) => name.trim().toLowerCase()));
  for (let number = 1; ; number += 1) {
    const suffix = ` ${number}`;
    const candidate = `${sourceName.trim().slice(0, 80 - suffix.length)}${suffix}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

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
