import { bentoPublicTemplateV1 } from "./generated/bento-v1.ts";
import { standardPublicTemplateV1 } from "./generated/standard-v1.ts";
import { resolvePublicTemplateAsset } from "./runtime/assets.ts";
import {
  compiledPublicTemplateSchemaV1,
  publicTemplateKey,
  type CompiledPublicTemplateV1,
} from "./schema.ts";

export const DEFAULT_PUBLIC_TEMPLATE_KEY = "bento@1" as const;
export const LEGACY_PUBLIC_TEMPLATE_KEY = "standard@1" as const;

export type PublicTemplateRegistryEntry = {
  enabled: boolean;
  label: string;
  template: CompiledPublicTemplateV1;
};

export const publicTemplateRegistry = {
  "bento@1": {
    enabled: true,
    label: "Bento",
    template: bentoPublicTemplateV1,
  },
  "standard@1": {
    enabled: true,
    label: "Standard",
    template: standardPublicTemplateV1,
  },
} as const satisfies Record<string, PublicTemplateRegistryEntry>;

export type PublicTemplateKey = keyof typeof publicTemplateRegistry;

export function getPublicTemplateRegistryEntry(key: string) {
  return publicTemplateRegistry[key as PublicTemplateKey] as
    PublicTemplateRegistryEntry | undefined;
}

export function getPublicTemplate(key: string): CompiledPublicTemplateV1 | undefined {
  const entry = getPublicTemplateRegistryEntry(key);
  if (!entry) return undefined;
  const parsed = compiledPublicTemplateSchemaV1.safeParse(entry.template);
  if (
    !parsed.success ||
    parsed.data.assetIds.some((assetId) => resolvePublicTemplateAsset(assetId) === undefined)
  )
    return undefined;
  return entry.template;
}

export function publicTemplateOptions() {
  return Object.values(publicTemplateRegistry)
    .filter(({ enabled }) => enabled)
    .map(({ label, template }) => ({
      id: template.id,
      key: template.key as PublicTemplateKey,
      label,
      version: template.version,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function registeredPublicTemplateKey(id: string, version: number) {
  const key = publicTemplateKey(id, version);
  return getPublicTemplateRegistryEntry(key) ? (key as PublicTemplateKey) : undefined;
}
