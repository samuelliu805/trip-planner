import type { RelationalDatabase } from "@/platform/contracts/relational";
import type { StorageProvider } from "@/platform/contracts/storage";

type AuthorizationResult =
  | Readonly<{ error: string }>
  | Readonly<{
      data: Readonly<{ path: string; signedUrl: string; token: string }>;
    }>;

export function authorizePendingShareImageUpload(
  options: Readonly<{
    database: RelationalDatabase;
    path: string;
    storage: Pick<StorageProvider, "createSignedUploadUrl">;
  }>,
): Promise<AuthorizationResult>;
