export type StoredUpload = {
  id: string;
  scope: string[];
  target: "itinerary" | "research";
  entityId: string;
  sessionId: string;
  parentOperationId?: string;
  operationId: string;
  commitOperationId: string;
  file: File;
  expectedVersion?: number;
  uploaded?: boolean;
  bytesUploaded?: boolean;
  binding?: boolean;
  error?: string;
};

export function validStoredUpload(record: StoredUpload) {
  const uuid = (value: unknown) =>
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  return (
    Array.isArray(record.scope) &&
    record.scope.length === 4 &&
    record.scope.every((value) => typeof value === "string") &&
    uuid(record.scope[2]) &&
    uuid(record.id) &&
    uuid(record.entityId) &&
    uuid(record.sessionId) &&
    uuid(record.operationId) &&
    uuid(record.commitOperationId) &&
    (record.parentOperationId === undefined || uuid(record.parentOperationId)) &&
    ["itinerary", "research"].includes(record.target) &&
    record.file instanceof File &&
    (record.expectedVersion === undefined ||
      (Number.isInteger(record.expectedVersion) && record.expectedVersion > 0)) &&
    [record.bytesUploaded, record.uploaded, record.binding].every(
      (value) => value === undefined || typeof value === "boolean",
    ) &&
    (record.error === undefined || typeof record.error === "string")
  );
}

/** Resolve only after transaction completion, never after the individual put request. */
async function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("trip-planner-uploads", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("uploads", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Close older tabs to enable file recovery."));
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = database.transaction("uploads", mode);
      const request = run(tx.objectStore("uploads"));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error ?? request.error);
      tx.onabort = () => reject(tx.error ?? new Error("File recovery storage was interrupted."));
    });
  } finally {
    database.close();
  }
}

export const uploadStorage = {
  all: () => transaction("readonly", (store) => store.getAll()) as Promise<StoredUpload[]>,
  put: (task: StoredUpload) => transaction("readwrite", (store) => store.put(task)),
  remove: (id: string) => transaction("readwrite", (store) => store.delete(id)),
};
