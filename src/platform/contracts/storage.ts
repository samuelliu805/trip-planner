export type UploadBody = ArrayBuffer | Blob | Uint8Array;

export type UploadInput = Readonly<{
  body: UploadBody;
  cacheControl?: string;
  contentType?: string;
  path: string;
  upsert?: boolean;
}>;

export type StoredFile = Readonly<{
  fullPath?: string;
  id?: string;
  path: string;
}>;

export interface StorageProvider {
  upload(input: UploadInput): Promise<StoredFile>;
  createSignedUrl(path: string): Promise<string>;
  remove(paths: string[]): Promise<void>;
}
