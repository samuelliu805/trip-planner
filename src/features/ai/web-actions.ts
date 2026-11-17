"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { browserAiRpc } from "./database.server";
import { callRpc, invokeTool } from "./service";

export async function revokeConnection(form: FormData) {
  const id = z.uuid().parse(form.get("connection_id"));
  await callRpc(await browserAiRpc(), "ai_connections_v1", { action: "revoke", connection_id: id });
  revalidatePath("/account/ai");
}
export async function saveLibraryIdea(form: FormData) {
  await invokeTool(await browserAiRpc(), "idea_save_many", {
    idempotency_key: form.get("idempotency_key"),
    ideas: [
      { name: form.get("name"), ...(form.get("region") ? { region: form.get("region") } : {}) },
    ],
  });
  revalidatePath("/ideas");
}
export async function editLibraryIdea(form: FormData) {
  await invokeTool(await browserAiRpc(), "idea_update", {
    idempotency_key: form.get("idempotency_key"),
    idea_id: form.get("idea_id"),
    expected_revision: form.get("expected_revision"),
    patch: {
      name: form.get("name"),
      region: form.get("region") || null,
      notes: form.get("notes") || null,
      archived: form.get("archived") === "on",
    },
  });
  revalidatePath("/ideas");
}
