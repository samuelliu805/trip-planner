"use client";

import Image from "next/image";

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

import "./public-share-template-previews.css";

const templatePreviewImages = {
  bento: "/landing/paris-morning.webp",
  ethereal: "/landing/seine-route.webp",
  journal: "/landing/travel-desk.webp",
  neon: "/landing/paris-morning.webp",
  traverse: "/landing/seine-route.webp",
} as const;

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
  const selectedTemplateIndex = templates.findIndex(
    (template) =>
      settings.templateId === template.id && settings.templateVersion === template.version,
  );
  const chooseTemplate = (index: number) => {
    const template = templates[index];
    if (!template) return;
    onSettingChange("templateId", template.id);
    onSettingChange("templateVersion", template.version);
  };

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

      <div className="min-w-0 space-y-1.5 public-share-style-field">
        <Label id="public-share-template-label">
          <T message={"Style"} />
        </Label>
        <div
          aria-labelledby="public-share-template-label"
          className="public-share-style-previews"
          id="public-share-template"
          role="radiogroup"
        >
          {templates.map((template, index) => {
            const selected =
              settings.templateId === template.id && settings.templateVersion === template.version;
            const image = templatePreviewImages[template.id as keyof typeof templatePreviewImages];
            return (
              <button
                aria-checked={selected}
                className={`public-share-style-preview is-${template.id}`}
                key={`${template.key}:preview`}
                onClick={() => chooseTemplate(index)}
                onKeyDown={(event) => {
                  const delta =
                    event.key === "ArrowLeft" || event.key === "ArrowUp"
                      ? -1
                      : event.key === "ArrowRight" || event.key === "ArrowDown"
                        ? 1
                        : 0;
                  const nextIndex =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? templates.length - 1
                        : delta
                          ? (index + delta + templates.length) % templates.length
                          : index;
                  if (nextIndex === index) return;
                  event.preventDefault();
                  chooseTemplate(nextIndex);
                  event.currentTarget.parentElement
                    ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
                    [nextIndex]?.focus();
                }}
                role="radio"
                tabIndex={selected || (selectedTemplateIndex === -1 && index === 0) ? 0 : -1}
                type="button"
              >
                <span className="public-share-style-preview-visual" aria-hidden="true">
                  {image ? <Image alt="" fill sizes="96px" src={image} /> : null}
                  <span className="public-share-style-preview-panel">
                    <i />
                    <i />
                    <i />
                  </span>
                </span>
                <span className="public-share-style-preview-label">
                  <Localized value={template.label} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
