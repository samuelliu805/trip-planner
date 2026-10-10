import type { QueryClient } from "@tanstack/react-query";
import { ownedResearchRuntime } from "./use-research-sync";
import { researchEditableSnapshot } from "./editable-snapshot";
import type { ResearchSyncIntent } from "./research-sync-runtime";
import type { ResearchItem } from "./types";

/** Capture accepted local revisions even when the calling card still has older props. */
export function captureOwnedSources(scope: string[], client: QueryClient, items: ResearchItem[]) {
  const runtime = ownedResearchRuntime([...scope.slice(0, 3), "ideas"], client);
  const pending = new Set(
    runtime.queue.operations
      .filter((op) => op.status !== "acknowledged")
      .map((op) => {
        const intent = op.intent as unknown as ResearchSyncIntent;
        return intent.kind === "create" || intent.kind === "capture"
          ? intent.input.operationId
          : intent.kind === "merge"
            ? intent.input.researchItemId
            : intent.input.id;
      }),
  );
  const projected = runtime.project(),
    sourceBefore: Record<string, string> = {};
  const accepted = items.map((item) => {
    if (!pending.has(item.id)) return item;
    const source = projected.find((source) => source.id === item.id);
    if (!source) throw new Error("This Idea is pending removal. Your choices are kept.");
    sourceBefore[source.id] = researchEditableSnapshot(source);
    return source;
  });
  return {
    items: accepted,
    sourceBefore: Object.keys(sourceBefore).length ? sourceBefore : undefined,
  };
}
