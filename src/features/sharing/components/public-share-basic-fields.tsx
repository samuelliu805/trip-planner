import { Localized, T } from "@/features/i18n/i18n-provider";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PlannerVariant } from "@/features/itinerary/types";

import { publicTemplateOptions } from "../templates/registry";
import type { ShareSettings } from "./public-share-settings";

/** The only two answers a shareable page needs before it can be published. */
export function PublicShareBasicFields({
  existingPage,
  onChooseVariant,
  onSettingChange,
  settings,
  variantId,
  variants,
}: {
  existingPage: boolean;
  onChooseVariant: (variantId: string) => void;
  onSettingChange: <Key extends keyof ShareSettings>(key: Key, value: ShareSettings[Key]) => void;
  settings: ShareSettings;
  variantId: string;
  variants: PlannerVariant[];
}) {
  const templates = publicTemplateOptions();

  return (
    <div className={`grid min-w-0 gap-4 ${existingPage ? "" : "sm:grid-cols-2"}`}>
      {!existingPage ? (
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="public-share-variant">
            <T message={"Route"} />
          </Label>
          <Select onValueChange={onChooseVariant} value={variantId}>
            <SelectTrigger className="min-h-11 min-w-0" id="public-share-variant">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {variants.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="min-w-0 space-y-1.5">
        <Label htmlFor="public-share-template">
          <T message={"Style"} />
        </Label>
        <Select
          onValueChange={(key) => {
            const template = templates.find((option) => option.key === key);
            if (!template) return;
            onSettingChange("templateId", template.id);
            onSettingChange("templateVersion", template.version);
          }}
          value={`${settings.templateId}@${settings.templateVersion}`}
        >
          <SelectTrigger className="min-h-11 min-w-0" id="public-share-template">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {templates.map((template) => (
              <SelectItem key={template.key} value={template.key}>
                <Localized value={template.label} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
