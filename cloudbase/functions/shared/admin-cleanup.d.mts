export type CleanupDatabase = Readonly<{
  rpc(
    name: string,
    parameters: Readonly<Record<string, unknown>>,
  ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}>;

export type CleanupStorage = Readonly<{ remove(paths: string[]): Promise<void> }>;
export type CleanupBackend = Readonly<{
  database: CleanupDatabase;
  storage(bucket: string): CleanupStorage;
}>;

export type AssetCleanupResult = Readonly<{
  deletedAssets: number;
  deletedFiles: number;
  error: string | null;
  untrackedFiles: number;
}>;

export type ShareImageCleanupResult = Readonly<{
  deletedFiles: number;
  error: string | null;
  revokedImages: number;
}>;

export function drainAssetDeletionQueue(
  backend: CleanupBackend,
  limit?: number,
): Promise<AssetCleanupResult>;
export function cleanupExpiredShareImages(
  backend: CleanupBackend,
  limit?: number,
): Promise<ShareImageCleanupResult>;
export function runCleanupJobs(
  backend: CleanupBackend,
  limit?: number,
): Promise<{
  assets: AssetCleanupResult;
  backlog: boolean;
  error: string | null;
  shareImages: ShareImageCleanupResult;
}>;
