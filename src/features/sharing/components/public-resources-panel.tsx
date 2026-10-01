"use client";

import { Paperclip } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PullUpPanel } from "@/components/ui/pull-up-panel";
import { T } from "@/features/i18n/i18n-provider";
import { publicItemAttachments } from "../editorial-presentation";
import { usePublicTemplateController } from "../templates/runtime/controller";
import { PublicItemMediaGallery } from "./public-item-media";
import { PublicItemDetails } from "./public-item-details";

export function PublicAttachmentsTrigger() {
  const { itinerary } = usePublicTemplateController();
  const [open, setOpen] = useState(false);
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const items = itinerary.days
    .flatMap((day) => day.items)
    .filter((item) => publicItemAttachments(item).length);
  if (!items.length) return null;
  return (
    <>
      <Button
        aria-label="Attachments"
        data-i18n-aria-label="Attachments"
        className="public-header-button size-11 px-0"
        variant="outline"
        onClick={(event) => {
          setTrigger(event.currentTarget);
          setOpen(true);
        }}
      >
        <Paperclip aria-hidden="true" className="size-4" />
      </Button>
      <PullUpPanel
        id="public-attachments"
        open={open}
        onOpenChange={setOpen}
        title="Attachments"
        compactHeader
        dragMode="all"
        trigger={trigger}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5 pb-5">
          {items.map((item) => (
            <section key={item.ref} className="mb-5">
              <h3 className="break-words font-semibold">{item.title}</h3>
              <PublicItemMediaGallery media={publicItemAttachments(item)} variant="table" />
            </section>
          ))}
        </div>
      </PullUpPanel>
    </>
  );
}

export function PublicItemDetailsPanel() {
  const { detailItemRef, detailTrigger, itinerary, setDetailItemRef, template } =
    usePublicTemplateController();
  const item = itinerary.days
    .flatMap((day) => day.items)
    .find((candidate) => candidate.ref === detailItemRef);
  return (
    <PullUpPanel
      id="public-item-details"
      title={item?.title || "Details"}
      compactHeader
      open={Boolean(item)}
      onOpenChange={(open) => !open && setDetailItemRef(undefined)}
      dragMode="all"
      trigger={detailTrigger}
      className={`public-template-${template.id}`}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5 pb-5">
        {item ? <PublicItemDetails item={item} /> : <T message="No shared plans for this day." />}
      </div>
    </PullUpPanel>
  );
}
