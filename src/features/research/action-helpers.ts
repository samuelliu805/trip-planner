import "server-only";

import { revalidatePath } from "next/cache";

const researchDomainMessages: Record<string, string> = {
  APP_CONFLICT: "Someone else changed this record first. Reload its latest version.",
  AUTHENTICATION_REQUIRED: "Sign in again before changing this Plan.",
  RESEARCH_APPLICATION_NOT_FOUND: "That Apply record is no longer available.",
  RESEARCH_APPLICATION_SUPERSEDED:
    "A newer option has replaced this Apply record. View the current option instead.",
  RESEARCH_APPLY_CATEGORY_UNSUPPORTED:
    "Apply is currently available for Flights, Stays, Trains, and Rentals.",
  RESEARCH_CONTEXT_VARIANT_MISMATCH: "This saved context belongs to another Plan.",
  RESEARCH_IMPACT_DATE_SHIFT: "Review the date shift before changing the Plan.",
  RESEARCH_IMPACT_MANUAL_REVIEW: "This option needs manual review before Apply.",
  RESEARCH_IMPACT_STRUCTURAL:
    "This option changes the Plan structure and cannot be applied automatically.",
  RESEARCH_ITEM_NOT_FOUND: "That saved candidate is no longer available.",
  RESEARCH_ITEM_NOT_READY: "Add the missing comparison details before applying this option.",
  RESEARCH_PLAN_DAY_LIMIT: "This option would make the Plan longer than 366 days.",
  RESEARCH_SHORTEN_REQUIRES_REVIEW:
    "This flight is shorter than the Plan and the extra days contain saved work. Choose whether to keep those days.",
  RESEARCH_SELECTION_REQUIRED: "The Plan choice changed. Try applying this option again.",
  RESEARCH_TARGET_AMBIGUOUS: "The canonical target is ambiguous. Review the Plan first.",
  RESEARCH_TARGET_CONFLICT: "The canonical Plan changed and now needs manual review.",
  RESEARCH_TARGET_MISSING: "The canonical target no longer exists.",
  TRIP_OWNER_REQUIRED: "Only the trip owner can change Research selections.",
  VARIANT_NOT_FOUND: "The selected Plan is no longer available.",
};

export function researchDomainError(message?: string) {
  const code = Object.keys(researchDomainMessages).find((candidate) =>
    message?.includes(candidate),
  );
  return code ? researchDomainMessages[code] : "The Research choice could not be changed safely.";
}

export function firstIssue(error: { issues: Array<{ message: string }> }) {
  return error.issues[0]?.message ?? "Check the price candidate details.";
}

export function revalidateResearch(tripId: string) {
  revalidatePath(`/trips/${tripId}/compare`);
  revalidatePath(`/trips/${tripId}`);
}
