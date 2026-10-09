"use client";
import { UploadOwner } from "./upload-owner";
import { uploadStorage, type StoredUpload } from "./upload-storage";
import { isAccountActive } from "../editing/account-runtime";

const owners = new Map<string, UploadOwner>();
export function uploadOwner(
  scope: string[],
  entityId: string,
  sessionId: string,
  target: StoredUpload["target"],
) {
  const key = JSON.stringify([scope, entityId, sessionId, target]);
  let owner = owners.get(key);
  if (!owner) {
    owner = new UploadOwner(scope, entityId, sessionId, target);
    owners.set(key, owner);
  }
  return owner;
}
export async function restoreAccountUploads(actorId: string) {
  const records = await uploadStorage.all();
  if (!isAccountActive(actorId)) return;
  for (const record of records) {
    if (
      !Array.isArray(record.scope) ||
      record.scope[1] !== actorId ||
      record.scope[0] !== (process.env.NEXT_PUBLIC_APP_REGION ?? "global")
    )
      continue;
    const owner = uploadOwner(record.scope, record.entityId, record.sessionId, record.target);
    await owner.restore([record]);
    owner.enable();
  }
}
