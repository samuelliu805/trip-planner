export function UnsavedAttachmentsSection() {
  return (
    <section className="space-y-2 border-t pt-4" aria-labelledby="attachments-heading">
      <div>
        <h3 className="text-sm font-medium" id="attachments-heading">
          Attachments
        </h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Save this itinerary item first, then reopen it to add private files. This prevents files
          from being linked to a temporary draft.
        </p>
      </div>
    </section>
  );
}
