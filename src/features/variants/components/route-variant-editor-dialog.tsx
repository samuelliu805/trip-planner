"use client";

import { Localized, useI18n } from "@/features/i18n/i18n-provider";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useId, useState, useEffect } from "react";

import { PlannerEditorForm } from "@/features/itinerary/components/planner-editor-form";
import { PlannerEditorHeader } from "@/features/itinerary/components/planner-editor-header";
import { PlannerEditorScreen } from "@/features/itinerary/components/planner-editor-screen";
import { ItineraryMutationError } from "@/features/itinerary/query-cache";
import type { PlannerVariant } from "@/features/itinerary/types";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import { useVariantSync } from "../use-variant-sync";
import { useDurableFields } from "@/features/editing/use-durable-fields";
import { useDraftScope } from "@/features/editing/draft-scope";
import { editingStorageKey } from "@/features/editing/draft-storage";
import { LocalDraftStatus } from "@/features/editing/local-draft-status";
import { loadPlannerWorkspace } from "@/features/itinerary/actions";
import { plannerQueryKey } from "@/features/itinerary/planner-query";
import { requireData } from "@/features/itinerary/query-cache";

import { variantListQueryKey } from "../variant-list-reload";
import { loadRouteVariants } from "../actions";
import { clonedVariantName, nextVariantName } from "../default-name";
import { variantColorPalette } from "../schema";
import { VariantEditorFields } from "./variant-editor-fields";

export type VariantEditorMode = "blank" | "duplicate" | "metadata";

function nextVariantDefaults(variants: PlannerVariant[], locale: "en" | "zh-CN") {
  const color =
    variantColorPalette.find(
      (candidate) => !variants.some((variant) => variant.color.toLowerCase() === candidate.value),
    )?.value ?? variantColorPalette[variants.length % variantColorPalette.length].value;
  return { color, name: nextVariantName(variants, locale) };
}

export function RouteVariantEditorDialog({
  activeVariant,
  mode,
  onOpenChange,
  onSaved,
  open,
  tripId,
  variants,
}: {
  activeVariant: PlannerVariant;
  mode: VariantEditorMode;
  onOpenChange: (open: boolean) => void;
  onSaved?: (variantId: string) => void;
  open: boolean;
  tripId: string;
  variants: PlannerVariant[];
}) {
  const { locale } = useI18n();
  const [initialValues] = useState(() =>
    mode === "metadata"
      ? { color: activeVariant.color.toLowerCase(), name: activeVariant.name }
      : {
          ...nextVariantDefaults(variants, locale),
          name:
            mode === "duplicate"
              ? clonedVariantName(activeVariant.name, variants)
              : nextVariantName(variants, locale),
        },
  );
  const local = useDurableFields(
    editingStorageKey(useDraftScope(tripId, "variants"), `${mode}:${activeVariant.id}`),
    { ...initialValues, sourceVariantId: activeVariant.id },
  );
  const { name, color, sourceVariantId } = local.values;
  const setName = (value: string) => local.set("name", value);
  const setColor = (value: string) => local.set("color", value);
  const setSourceVariantId = (value: string) => local.set("sourceVariantId", value);
  const [error, setError] = useState<string>();
  const [conflict, setConflict] = useState(false);
  const [baseVersion, setBaseVersion] = useState(activeVariant.version);
  const [latestVariant, setLatestVariant] = useState<PlannerVariant>();
  const [latestVariants, setLatestVariants] = useState<PlannerVariant[]>();
  const [entityUnavailable, setEntityUnavailable] = useState(false);
  const queryClient = useQueryClient();
  const runtime = useVariantSync(tripId, variants);
  const sourceQuery = useQuery({
    queryKey: plannerQueryKey(tripId, sourceVariantId),
    enabled:
      open &&
      mode !== "metadata" &&
      !runtime?.queue.operations.some((op) => op.id === sourceVariantId),
    queryFn: async () => requireData(await loadPlannerWorkspace(tripId, sourceVariantId)),
    staleTime: 30000,
    retry: false,
  });
  const pending = false;
  const [composing, setComposing] = useState(false);
  const nameId = useId();

  function submit(closeAfter = true) {
    setError(undefined);
    const operationId = newTelemetryOperationId();
    try {
      if (!runtime || local.getError())
        throw new Error(
          local.getError() ?? "This Plan could not be stored locally. Your draft is kept.",
        );
      const source = runtime
        .project()
        .find(
          ({ id }) =>
            id === (mode === "blank" || mode === "metadata" ? activeVariant.id : sourceVariantId),
        );
      if (!source) {
        setEntityUnavailable(true);
        setError("The source Plan is no longer available. Reload the latest Plans.");
        return;
      }
      if (mode === "metadata" && source.version !== baseVersion) {
        setConflict(true);
        setLatestVariant(source);
        setError("This Plan changed while you were editing it. Review the latest values.");
        return;
      }
      const sourceVersions = {
        expectedSourceContentVersion: source.content_version,
        expectedSourceDaysVersion: source.days_version,
        expectedSourceItemsVersion: source.items_version,
        expectedSourceVersion: source.version,
      };
      const snapshot = sourceQuery.data;
      if (mode !== "metadata" && !snapshot)
        throw new Error(
          sourceQuery.error?.message ?? "The source Plan is still loading. Your draft is kept.",
        );
      const result =
        mode === "metadata"
          ? runtime.accept({
              kind: "update",
              input: {
                color,
                expectedVersion: baseVersion,
                name,
                tripId,
                variantId: activeVariant.id,
                operationId,
              },
            })
          : runtime.accept({
              kind: "create",
              duplicate: mode === "duplicate",
              source: snapshot!,
              input: {
                color,
                ...sourceVersions,
                name,
                operationId,
                sourceVariantId: source.id,
                tripId,
                dayIds: Object.fromEntries(
                  snapshot!.days.map((day) => [day.id, crypto.randomUUID()]),
                ),
                itemIds:
                  mode === "duplicate"
                    ? Object.fromEntries(
                        snapshot!.days
                          .flatMap((day) => day.items)
                          .map((item) => [item.id, crypto.randomUUID()]),
                      )
                    : {},
              },
            });
      local.discard();
      if (mode === "metadata")
        setBaseVersion(
          result.variants.find((row) => row.id === activeVariant.id)?.version ?? baseVersion,
        );
      if (closeAfter) {
        onOpenChange(false);
        onSaved?.(result.variantId);
      }
    } catch (caught) {
      setConflict(caught instanceof ItineraryMutationError && caught.code === "conflict");
      setError(caught instanceof Error ? caught.message : "The Plan could not be saved.");
    }
  }

  const canAutosave =
    mode === "metadata" &&
    open &&
    runtime &&
    !composing &&
    !local.error &&
    name.trim().length > 0 &&
    name.trim().length <= 80;
  useEffect(() => {
    if (!canAutosave || !local.hasChanges()) return;
    const timer = window.setTimeout(() => submit(false), 500);
    return () => window.clearTimeout(timer);
    // Changes are keyed to raw fields; a successful durable acceptance advances their baseline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAutosave, name, color]);
  function closeEditor() {
    if (mode === "metadata" && runtime && !local.getError() && local.hasChanges() && name.trim())
      submit(false);
    onOpenChange(false);
  }

  async function reloadLatest() {
    const key = variantListQueryKey(tripId);
    const loaded = await queryClient.fetchQuery({
      queryFn: async () => {
        const result = await loadRouteVariants(tripId);
        if (!result.data) throw new Error(result.error ?? "The latest Plans could not be loaded.");
        return result.data;
      },
      queryKey: key,
      staleTime: 0,
    });
    const latest = loaded.find(({ id }) => id === activeVariant.id);
    if (!latest) {
      setEntityUnavailable(true);
      setConflict(false);
      setError("This Plan is no longer available. Close this editor and choose another Plan.");
      return;
    }
    setBaseVersion(latest.version);
    setLatestVariant(latest);
    setLatestVariants(loaded);
    setEntityUnavailable(false);
    setConflict(false);
    setError(undefined);
  }

  const title =
    mode === "blank"
      ? "Create an empty Plan"
      : mode === "duplicate"
        ? "Duplicate a Plan"
        : "Edit Plan";

  return (
    <PlannerEditorScreen
      nonBlocking
      editorKind="variant"
      onOpenChange={(value) => (value ? onOpenChange(true) : closeEditor())}
      open={open}
    >
      <PlannerEditorForm
        compactActions
        header={
          <PlannerEditorHeader
            closeDisabled={pending}
            description={
              mode === "blank"
                ? "Creates the same planning days with no itinerary items or saved routes."
                : mode === "duplicate"
                  ? "Copies days, items, links, saved stops, and leg modes. Route calculations are not copied."
                  : "The Plan name and color identify this version throughout the planner."
            }
            error={error ?? local.error ?? sourceQuery.error?.message}
            onClose={closeEditor}
            title={title}
          />
        }
        onCancel={closeEditor}
        onClose={closeEditor}
        onSave={() => submit()}
        pending={pending}
        pendingLabel="Saving…"
        saveDisabled={
          entityUnavailable ||
          !name.trim() ||
          !runtime ||
          (mode !== "metadata" && !sourceQuery.data)
        }
        saveLabel={
          mode === "blank"
            ? "Create Plan"
            : mode === "duplicate"
              ? "Duplicate Plan"
              : "Save changes"
        }
      >
        <LocalDraftStatus
          draft={local}
          onDiscard={() => {
            if (local.discard()) onOpenChange(false);
          }}
        />
        {conflict ? (
          <button
            className="min-h-11 rounded-md border border-destructive px-4 text-sm font-medium text-destructive"
            onClick={() => void reloadLatest()}
            type="button"
          >
            <Localized value="Reload latest" />
          </button>
        ) : null}
        <VariantEditorFields
          latestVariant={latestVariant}
          mode={mode}
          nameId={nameId}
          sourceVariantId={sourceVariantId}
          variants={latestVariants ?? variants}
          name={name}
          color={color}
          onNameChange={setName}
          onColorChange={setColor}
          onSourceChange={setSourceVariantId}
          onCompositionChange={setComposing}
          onUseLatest={() => setLatestVariant(undefined)}
        />
      </PlannerEditorForm>
    </PlannerEditorScreen>
  );
}
