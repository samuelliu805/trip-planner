import type {
  ItemEditorCloseReason,
  ItemKind,
  ProductContext,
  TelemetryEventProperties,
} from "../../lib/telemetry/events.ts";
import { durationBucket } from "../../lib/telemetry/product.ts";

type EditorTelemetryEvent = "item_editor_closed" | "item_editor_opened";
type EditorTelemetryCapture = <EventName extends EditorTelemetryEvent>(
  eventName: EventName,
  properties: Omit<TelemetryEventProperties[EventName], keyof ProductContext>,
) => void;

export function createItemEditorTelemetrySession(options: {
  capture: EditorTelemetryCapture;
  editorMode: "create" | "edit";
  itemKind: ItemKind;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const startedAt = now();
  let opened = false;
  let terminalClosed = false;
  let pageHiddenCaptured = false;

  return {
    close(reason: ItemEditorCloseReason, dirty: boolean): boolean {
      if (reason === "page_hidden") {
        if (pageHiddenCaptured || terminalClosed) return false;
        pageHiddenCaptured = true;
      } else {
        if (terminalClosed) return false;
        terminalClosed = true;
      }
      options.capture("item_editor_closed", {
        close_reason: reason,
        dirty,
        duration_bucket: durationBucket(Math.max(0, now() - startedAt)),
        editor_mode: options.editorMode,
        item_kind: options.itemKind,
        surface: "item_editor",
      });
      return true;
    },
    open(): boolean {
      if (opened) return false;
      opened = true;
      options.capture("item_editor_opened", {
        editor_mode: options.editorMode,
        item_kind: options.itemKind,
        surface: "item_editor",
      });
      return true;
    },
  };
}
