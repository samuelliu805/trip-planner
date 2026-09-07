import { handleShareImageFallbackUpload } from "@/features/sharing/long-image/fallback-upload-handler";
import {
  getAuthProvider,
  getBackendCapabilities,
  getRelationalDatabase,
  getStorageProvider,
} from "@/platform/composition/server";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  if (!getBackendCapabilities().signedUrls) return new Response(null, { status: 404 });
  return handleShareImageFallbackUpload(request, {
    getCurrentUser: () => getAuthProvider().getCurrentUser(),
    getDatabase: getRelationalDatabase,
    getStorage: () => getStorageProvider("share-images"),
  });
}
