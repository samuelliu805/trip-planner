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

export type SignedUploadAuthorization = Readonly<{
  signedUrl: string;
  token: string;
}>;

export type SignedUploadInput = UploadInput &
  Readonly<{
    signedUrl: string;
    token: string;
  }>;

export interface StorageProvider {
  upload(input: UploadInput): Promise<StoredFile>;
  createSignedUrl(path: string, options?: { download?: string }): Promise<string>;
  createSignedUploadUrl(path: string): Promise<SignedUploadAuthorization>;
  download(path: string): Promise<Blob>;
  remove(paths: string[]): Promise<void>;
}

export interface BrowserStorageProvider {
  upload(input: UploadInput): Promise<StoredFile>;
  uploadToSignedUrl(input: SignedUploadInput): Promise<StoredFile>;
  remove(paths: string[]): Promise<void>;
}
