import type { PreparedShareImage, ShareImagePartInput } from "../types";
export type ExportJobCheckpoint = {
  id: string;
  scope: string[];
  prepared: PreparedShareImage;
  parts?: { blob: Blob; metadata: ShareImagePartInput; uploaded: boolean }[];
  finalizing?: boolean;
};
async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("trip-planner-image-exports", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("jobs", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Close older tabs to recover this export."));
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("jobs", mode),
        request = action(tx.objectStore("jobs"));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () =>
        reject(tx.error ?? request.error ?? new Error("Export recovery storage failed."));
    });
  } finally {
    db.close();
  }
}
export const imageExportStorage = {
  get: (id: string) =>
    transaction("readonly", (store) => store.get(id)) as Promise<ExportJobCheckpoint | undefined>,
  put: (job: ExportJobCheckpoint) => transaction("readwrite", (store) => store.put(job)),
  remove: (id: string) => transaction("readwrite", (store) => store.delete(id)),
};
