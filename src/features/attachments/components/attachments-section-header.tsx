import { Localized, T } from "@/features/i18n/i18n-provider";
import { Paperclip, UploadCloud } from "lucide-react";
import type { RefObject } from "react";

import { Button } from "@/components/ui/button";
import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENTS_PER_ITEM,
  attachmentAcceptedTypeCopy,
} from "@/features/attachments/config";

export function AttachmentsSectionHeader({
  count,
  disabled,
  inputRef,
  onFiles,
}: {
  count: number;
  disabled: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onFiles: (files: File[]) => void;
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="flex items-center gap-1.5 text-base font-bold" id="attachments-heading">
          <Paperclip aria-hidden="true" className="size-4" /> <T message={" Attachments "} />
          <span className="font-normal text-muted-foreground">
            {count}/{MAX_ATTACHMENTS_PER_ITEM}
          </span>
        </h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          <Localized value={attachmentAcceptedTypeCopy} />
        </p>
      </div>
      <input
        accept={ATTACHMENT_ACCEPT}
        className="sr-only"
        disabled={disabled}
        multiple
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
        ref={inputRef}
        type="file"
      />
      <Button
        className="min-h-11 shrink-0"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        size="sm"
        type="button"
        variant="outline"
      >
        <UploadCloud aria-hidden="true" className="size-4" /> <T message={" Add files "} />
      </Button>
    </div>
  );
}
