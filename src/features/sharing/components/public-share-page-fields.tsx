import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PlannerVariant } from "@/features/itinerary/types";

import { canonicalPublicViews } from "../schema";
import { publicTemplateOptions } from "../templates/registry";
import { publicViewLabels, type ShareSettings } from "./public-share-settings";
import { ShareSettingSection } from "./public-share-setting-card";

export function PublicSharePageFields({
  existingPage,
  onChooseVariant,
  onSettingChange,
  settings,
  suggestedDescription,
  suggestedTitle,
  variantId,
  variants,
}: {
  existingPage: boolean;
  onChooseVariant: (variantId: string) => void;
  onSettingChange: <Key extends keyof ShareSettings>(key: Key, value: ShareSettings[Key]) => void;
  settings: ShareSettings;
  suggestedDescription: string;
  suggestedTitle: string;
  variantId: string;
  variants: PlannerVariant[];
}) {
  const templates = publicTemplateOptions();
  const variant = variants.find(({ id }) => id === variantId);

  return (
    <ShareSettingSection
      description="Choose how this link looks when someone opens it."
      title="Shareable page"
    >
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={existingPage ? undefined : "public-share-variant"}>
            {existingPage ? "Route (fixed)" : "Route"}
          </Label>
          {existingPage ? (
            <div className="flex min-h-11 items-center border bg-muted/30 px-3 text-sm">
              {variant?.name ?? "Route unavailable"}
            </div>
          ) : (
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
          )}
        </div>

        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="public-share-template">Style</Label>
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
                  {template.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Opens on</legend>
        <div className="grid grid-cols-3 border">
          {canonicalPublicViews.map((view) => (
            <button
              aria-pressed={settings.defaultView === view}
              className="min-h-11 border-r px-2 text-sm font-medium last:border-r-0 aria-pressed:bg-primary aria-pressed:text-primary-foreground"
              key={view}
              onClick={() => onSettingChange("defaultView", view)}
              type="button"
            >
              {publicViewLabels[view]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-3 border-t pt-4">
        <p className="text-sm font-medium">
          Shareable page text <span className="font-normal text-muted-foreground">(optional)</span>
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="share-title">Title</Label>
          <Input
            id="share-title"
            maxLength={160}
            onChange={(event) => onSettingChange("shareTitle", event.target.value)}
            placeholder={suggestedTitle}
            value={settings.shareTitle}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="share-description">Description</Label>
          <Textarea
            id="share-description"
            maxLength={500}
            onChange={(event) => onSettingChange("shareDescription", event.target.value)}
            placeholder={suggestedDescription}
            value={settings.shareDescription}
          />
        </div>
      </div>
    </ShareSettingSection>
  );
}
