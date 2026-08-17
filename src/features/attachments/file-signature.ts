import type { AttachmentKind, AttachmentMimeType } from "./config.ts";

export type DetectedAttachmentType = {
  kind: AttachmentKind;
  mimeType: AttachmentMimeType;
};

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.subarray(start, Math.min(end, bytes.length)));
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((byte, index) => bytes[index] === byte);
}

function includesAscii(bytes: Uint8Array, value: string, start = 0, end = bytes.length) {
  const target = new TextEncoder().encode(value);
  const limit = Math.min(end, bytes.length) - target.length;
  for (let offset = Math.max(0, start); offset <= limit; offset += 1) {
    if (target.every((byte, index) => bytes[offset + index] === byte)) return true;
  }
  return false;
}

function detectIsoVideo(bytes: Uint8Array): DetectedAttachmentType | null {
  if (bytes.length < 24 || ascii(bytes, 4, 8) !== "ftyp") return null;
  const header = ascii(bytes, 8, Math.min(128, bytes.length));
  const quickTime = header.includes("qt  ");
  const mp4Brand = /(isom|iso[2-9]|mp4[12]|avc1|dash|M4V )/.test(header);
  const hasMovie = includesAscii(bytes, "moov") || includesAscii(bytes, "moof");
  const hasMedia = includesAscii(bytes, "mdat");
  const hasVideoTrack = includesAscii(bytes, "vide");
  if ((!quickTime && !mp4Brand) || !hasMovie || !hasMedia || !hasVideoTrack) return null;
  return {
    kind: "video",
    mimeType: quickTime ? "video/quicktime" : "video/mp4",
  };
}

export function detectAttachmentType(bytes: Uint8Array): DetectedAttachmentType | null {
  if (
    bytes.length > 4 &&
    startsWith(bytes, [0xff, 0xd8, 0xff]) &&
    bytes.at(-2) === 0xff &&
    bytes.at(-1) === 0xd9
  )
    return { kind: "image", mimeType: "image/jpeg" };

  if (
    bytes.length > 20 &&
    startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) &&
    ascii(bytes, 12, 16) === "IHDR" &&
    includesAscii(bytes, "IEND", Math.max(0, bytes.length - 32))
  )
    return { kind: "image", mimeType: "image/png" };

  if (bytes.length > 16 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP")
    return { kind: "image", mimeType: "image/webp" };

  if (
    bytes.length > 8 &&
    ascii(bytes, 0, 5) === "%PDF-" &&
    includesAscii(bytes, "%%EOF", Math.max(0, bytes.length - 2048))
  )
    return { kind: "pdf", mimeType: "application/pdf" };

  if (
    bytes.length > 32 &&
    startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]) &&
    includesAscii(bytes, "webm", 0, Math.min(bytes.length, 4096))
  )
    return { kind: "video", mimeType: "video/webm" };

  return detectIsoVideo(bytes);
}
