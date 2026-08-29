import { T } from "@/features/i18n/i18n-provider";
export function UnsavedAttachmentsSection() {
  return (
    <section
      aria-labelledby="attachments-heading"
      className="space-y-2 border-t pt-4"
      data-attachment-editor=""
    >
      <div>
        <h3 className="text-base font-bold" id="attachments-heading">
          <T message={" Attachments "} />
        </h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          <T message={" Save first, then reopen to add files. "} />
        </p>
      </div>
    </section>
  );
}
