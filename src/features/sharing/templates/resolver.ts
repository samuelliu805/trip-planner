import {
  DEFAULT_PUBLIC_TEMPLATE_KEY,
  LEGACY_PUBLIC_TEMPLATE_KEY,
  getPublicTemplate,
  getPublicTemplateRegistryEntry,
  registeredPublicTemplateKey,
  type PublicTemplateKey,
} from "./registry.ts";
import type { CompiledPublicTemplateV1 } from "./schema.ts";

type PublicTemplateDiagnostic = {
  code: "DISABLED" | "INVALID_ARTIFACT" | "UNKNOWN_PERSISTED" | "USED_FALLBACK";
  requestedKey?: string;
};

export type ResolvedPublicTemplate = {
  diagnostics: PublicTemplateDiagnostic[];
  key: PublicTemplateKey;
  source: "fallback" | "legacy-query" | "persisted";
  template: CompiledPublicTemplateV1;
};

type ResolvePublicTemplateInput = {
  disabledKeys?: ReadonlySet<string>;
  legacyTemplate?: "bento" | "standard";
  persistedTemplateId?: string;
  persistedTemplateVersion?: number;
  runtimeEnabled?: boolean;
};

function availableTemplate(
  key: string,
  disabledKeys: ReadonlySet<string>,
): { code: "DISABLED" | "INVALID_ARTIFACT" } | { template: CompiledPublicTemplateV1 } {
  const entry = getPublicTemplateRegistryEntry(key);
  if (!entry?.enabled || disabledKeys.has(key)) return { code: "DISABLED" as const };
  const template = getPublicTemplate(key);
  if (!template) return { code: "INVALID_ARTIFACT" as const };
  return { template };
}

export function resolvePublicTemplate({
  disabledKeys = new Set(),
  legacyTemplate,
  persistedTemplateId,
  persistedTemplateVersion,
  runtimeEnabled = true,
}: ResolvePublicTemplateInput): ResolvedPublicTemplate {
  const diagnostics: PublicTemplateDiagnostic[] = [];
  const requested: Array<{ key?: string; source: "legacy-query" | "persisted" }> = [];

  if (runtimeEnabled && legacyTemplate)
    requested.push({ key: registeredPublicTemplateKey(legacyTemplate, 1), source: "legacy-query" });
  if (runtimeEnabled && persistedTemplateId && persistedTemplateVersion)
    requested.push({
      key: registeredPublicTemplateKey(persistedTemplateId, persistedTemplateVersion),
      source: "persisted",
    });

  for (const candidate of requested) {
    if (!candidate.key) {
      if (candidate.source === "persisted") diagnostics.push({ code: "UNKNOWN_PERSISTED" });
      continue;
    }
    const result = availableTemplate(candidate.key, disabledKeys);
    if ("template" in result)
      return {
        diagnostics,
        key: candidate.key as PublicTemplateKey,
        source: candidate.source,
        template: result.template,
      };
    diagnostics.push({ code: result.code, requestedKey: candidate.key });
  }

  const configuredFallback = runtimeEnabled
    ? DEFAULT_PUBLIC_TEMPLATE_KEY
    : LEGACY_PUBLIC_TEMPLATE_KEY;
  for (const key of [configuredFallback, LEGACY_PUBLIC_TEMPLATE_KEY] as const) {
    const result = availableTemplate(key, disabledKeys);
    if ("template" in result) {
      diagnostics.push({ code: "USED_FALLBACK", requestedKey: key });
      return { diagnostics, key, source: "fallback", template: result.template };
    }
    diagnostics.push({ code: result.code, requestedKey: key });
  }

  const guaranteed = getPublicTemplate(LEGACY_PUBLIC_TEMPLATE_KEY);
  if (!guaranteed) throw new Error("PUBLIC_TEMPLATE_REGISTRY_UNAVAILABLE");
  diagnostics.push({ code: "USED_FALLBACK", requestedKey: LEGACY_PUBLIC_TEMPLATE_KEY });
  return {
    diagnostics,
    key: LEGACY_PUBLIC_TEMPLATE_KEY,
    source: "fallback",
    template: guaranteed,
  };
}
