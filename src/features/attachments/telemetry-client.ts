"use client";

import type { AttachmentTarget } from "@/lib/telemetry/events";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";

export function captureAttachmentIntent(
  eventName: "attachment_opened" | "attachment_upload_started",
  target: AttachmentTarget,
): string {
  const operationId = newTelemetryOperationId();
  captureBrowserProductEvent(
    eventName,
    {
      attachment_target: target,
      operation_id: operationId,
      surface: "attachment_editor",
    },
    { actorType: "authenticated" },
  );
  return operationId;
}
