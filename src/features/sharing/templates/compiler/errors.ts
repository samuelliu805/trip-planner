export type PublicTemplateCompileErrorCode =
  | "ASSET_NOT_REGISTERED"
  | "CSS_FORBIDDEN"
  | "CSS_INVALID"
  | "LAYOUT_FORBIDDEN"
  | "LAYOUT_INVALID"
  | "LAYOUT_LIMIT"
  | "PART_DUPLICATE_LOCKED"
  | "PART_MISSING"
  | "PART_UNKNOWN"
  | "SOURCE_INVALID";

export class PublicTemplateCompileError extends Error {
  readonly code: PublicTemplateCompileErrorCode;

  constructor(code: PublicTemplateCompileErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "PublicTemplateCompileError";
  }
}
