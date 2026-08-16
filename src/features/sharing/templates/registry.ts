import { bentoPublicTemplateV1 } from "./generated/bento-v1.ts";
import { bentoPublicTemplateV2 } from "./generated/bento-v2.ts";
import { etherealPublicTemplateV1 } from "./generated/ethereal-v1.ts";
import { journalPublicTemplateV1 } from "./generated/journal-v1.ts";
import { standardPublicTemplateV1 } from "./generated/standard-v1.ts";
import { traversePublicTemplateV1 } from "./generated/traverse-v1.ts";
import { resolvePublicTemplateAsset } from "./runtime/assets.ts";
import {
  compiledPublicTemplateSchemaV1,
  publicTemplateKey,
  type CompiledPublicTemplateV1,
} from "./schema.ts";

export const DEFAULT_PUBLIC_TEMPLATE_KEY = "ethereal@1" as const;
export const LEGACY_PUBLIC_TEMPLATE_KEY = "standard@1" as const;

export type PublicTemplateRegistryEntry = {
  enabled: boolean;
  label: string;
  selectable: boolean;
  template: CompiledPublicTemplateV1;
};

export const publicTemplateRegistry = {
  "bento@1": {
    enabled: true,
    label: "Midnight Grid (legacy)",
    selectable: false,
    template: bentoPublicTemplateV1,
  },
  "bento@2": {
    enabled: true,
    label: "Midnight Grid",
    selectable: true,
    template: bentoPublicTemplateV2,
  },
  "ethereal@1": {
    enabled: true,
    label: "Ethereal",
    selectable: true,
    template: etherealPublicTemplateV1,
  },
  "journal@1": {
    enabled: true,
    label: "Trail Journal",
    selectable: true,
    template: journalPublicTemplateV1,
  },
  "standard@1": {
    enabled: true,
    label: "Classic (legacy)",
    selectable: false,
    template: standardPublicTemplateV1,
  },
  "traverse@1": {
    enabled: true,
    label: "Traverse Atlas",
    selectable: true,
    template: traversePublicTemplateV1,
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
    .filter(({ enabled, selectable }) => enabled && selectable)
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
