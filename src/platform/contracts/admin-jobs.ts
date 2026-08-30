export type CleanupJobResult = Readonly<{
  deletedFiles: number;
  deletedRecords: number;
  error: string | null;
}>;

export interface AdminCleanupJob {
  readonly name: "attachment-cleanup" | "share-image-cleanup";
  run(input?: { limit?: number }): Promise<CleanupJobResult>;
}
