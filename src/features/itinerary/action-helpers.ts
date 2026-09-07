export function firstIssue(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? "Check the item and try again.";
}

export function mutationError(message?: string) {
  if (message?.includes("itinerary_items_unique_transport_mode_per_day"))
    return "That transport type is already planned for this day. Choose a different type.";
  if (message?.includes("row-level security") || message?.includes("permission denied")) {
    return "You do not have permission to change itinerary items.";
  }
  return "The itinerary item could not be saved.";
}
