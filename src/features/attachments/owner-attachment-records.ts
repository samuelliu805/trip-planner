import type { OwnerAttachment } from "./schema";
import type { Tables } from "@/types/database";

type AttachmentAssetRow = Pick<
  Tables<"assets">,
  "byte_size" | "duration_seconds" | "height" | "media_kind" | "mime_type" | "status" | "width"
>;

export type OwnerAttachmentRow = Pick<
  Tables<"asset_links">,
  "created_at" | "display_filename" | "id" | "include_in_share" | "public_ref" | "sort_order"
> & { asset: AttachmentAssetRow | null };

export function ownerAttachmentsFromRows(
  rows: OwnerAttachmentRow[] | null | undefined,
): OwnerAttachment[] {
  return (rows ?? [])
    .flatMap((link) => {
      if (!link.asset) return [];
      return [
        {
          byteSize: link.asset.byte_size,
          createdAt: link.created_at,
          durationSeconds: link.asset.duration_seconds,
          fileName: link.display_filename,
          height: link.asset.height,
          id: link.id,
          includeInShare: link.include_in_share,
          kind: link.asset.media_kind,
          mimeType: link.asset.mime_type as OwnerAttachment["mimeType"],
          publicRef: link.public_ref,
          sortOrder: link.sort_order,
          status: link.asset.status,
          width: link.asset.width,
        },
      ];
    })
    .sort((left, right) => left.sortOrder - right.sortOrder);
}
