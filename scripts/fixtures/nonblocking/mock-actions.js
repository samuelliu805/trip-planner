async function call(kind, input) {
  const response = await fetch("/mock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, input }),
  });
  if (!response.ok) {
    const code =
      response.status === 409
        ? "conflict"
        : response.status === 401 || response.status === 403
          ? "forbidden"
          : "unexpected";
    return { error: `HTTP ${response.status}`, code };
  }
  return response.json();
}
export const loadPlannerWorkspace = (tripId, variantId) => call("load", { tripId, variantId });
export const createItineraryItem = (input) => call("create", input);
export const updateItineraryItem = (input) => call("update", input);
export const deleteItineraryItem = (input) => call("delete", input);
export const clearItineraryItems = (input) => call("clear", input);
export const reorderItineraryItems = (input) => call("reorder", input);
export const insertTripDay = (input) => call("insert", input);
export const removeTripDay = (input) => call("remove-day", input);
export const reorderVariantDays = (input) => call("reorder-days", input);
export const copyItineraryItems = (input) => call("copy", input);
export const captureIdea = (input) => call("idea", input);
export const mergeIdeaSource = (input) => call("merge", input);
export const createResearchItem = (input) => call("idea", input);
export const updateResearchItem = (input) => call("idea", input);
export const deleteResearchItem = (input) => call("delete-idea", input);
export const loadLatestAttachments = (input) => call("load-attachments", input);
export const saveTripSettings = (input) => call("settings", input);
export const saveDayRoutePlan = (input) => call("save-route", input);
export const clearDayRoutePlan = (input) => call("clear-route", input);
export const calculateDayRoute = (input) => call("calculate-route", input);
export const calculateOverviewRoute = (input) => call("overview-route", input);
export const createRouteVariant = (input) => call("create-plan", input);
export const duplicateRouteVariant = (input) => call("duplicate-plan", input);
export const updateRouteVariant = (input) => call("update-plan", input);
export const setPrimaryRouteVariant = (input) => call("primary-plan", input);
export const deleteRouteVariant = (input) => call("delete-plan", input);
export const loadRouteVariants = (tripId) => call("load-plans", { tripId });
export const loadVariantDecisionSummary = async () => ({ data: [] });
export const loadVariantComparison = async () => ({ data: [] });
export async function resolveIdeaCapture(input) {
  return {
    data: {
      tripId: input.tripId,
      operationId: input.operationId,
      category: input.kind === "car" ? "rental" : input.kind,
      title: input.title,
      sourceUrl: input.sourceUrl,
      note: input.shareText,
      links: [],
      segments: [],
    },
  };
}

export const inviteTripCollaborator = (input) => call("invite", input);
export const removeTripCollaborator = (input) => call("remove-member", input);
export const createPublicItineraryLink = (input) => call("share-create", input);
export const updatePublicItineraryLink = (linkId, expectedVersion, input) =>
  call("share-update", { ...input, linkId, expectedVersion });
export const revokePublicItineraryLink = (input) => call("share-revoke", input);
export const loadPublicItineraryLinks = (tripId) => call("share-load", { tripId });
export const prepareShareImageVersion = (input) => call("image-prepare", input);
export const finalizeShareImageVersion = (input) => call("image-finalize", input);
export const revokeShareImageExport = (exportId, operationId) =>
  call("image-revoke", { exportId, operationId });
export const authorizeShareImageUpload = (input) => call("image-authorize", input);
export function getBrowserStorageProvider() {
  return {
    uploadToSignedUrl: async (input) => {
      const value = await call("image-upload", {
        path: input.path,
        bytes: [...new Uint8Array(await input.body.arrayBuffer())],
        operationId: input.path,
      });
      if (value.error) throw new Error(value.error);
    },
  };
}

export const loadLongImageEditorWorkspace = (input) => call("image-editor", input);

export const applyQueuedIdea = (input) => call("idea-apply", input);
export const applyResearchItem = (input) => call("booking-apply", input);
export const revertResearchApplication = (input) => call("booking-revert", input);
export const createIdeaComparison = (input) => call("comparison-create", input);
export const deleteIdeaComparison = (input) => call("comparison-delete", input);
export const loadIdeaComparisons = (tripId) => call("comparison-load", { tripId });
export const loadIdeaVariantPlans = (tripId) => call("idea-plans", { tripId });
export const runTripBackgroundAction = (intent) => call(intent.kind, intent.input);
export const runAttachmentBackgroundAction = (intent) => call("attachment-mutate", intent.input);
export const countActiveSharePages = async () => 0;
export const loadTripDeleteSnapshot = (tripId) => call("trip-snapshot", { tripId });
export const loadTripStatusSnapshot = (tripId) => call("trip-snapshot", { tripId });
export const loadResearchItem = (input) => call("research-load", input);
