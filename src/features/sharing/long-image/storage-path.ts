import { z } from "zod";

export const MAX_SHARE_IMAGE_PART_BYTES = 10_485_760;

export const shareImageUploadPathSchema = z
  .string()
  .min(1)
  .max(1_000)
  .refine((path) => {
    const parts = path.split("/");
    return (
      parts.length === 4 &&
      z.uuid().safeParse(parts[1]).success &&
      z.uuid().safeParse(parts[2]).success &&
      /^part-[1-9][0-9]*\.jpg$/.test(parts[3])
    );
  });

export function ownedShareImagePath(path: string, userId: string, versionId?: string) {
  const parsed = shareImageUploadPathSchema.safeParse(path);
  if (!parsed.success) return false;
  const parts = parsed.data.split("/");
  return parts[0] === userId && (!versionId || parts[2] === versionId);
}
