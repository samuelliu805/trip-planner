"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDraftScope } from "@/features/editing/draft-scope";
import { useDurableFields } from "@/features/editing/use-durable-fields";
import { useResearchSync } from "../use-research-sync";
import { editingStorageKey } from "@/features/editing/draft-storage";

import { Button } from "@/components/ui/button";
import { T, useI18n } from "@/features/i18n/i18n-provider";
import type { PlaceSnapshot } from "@/lib/providers/places/types";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";

import { captureIdea, mergeIdeaSource } from "../idea-actions";
import {
  classifyIdeaInput,
  findDuplicateIdea,
  overrideIdeaClassification,
  parseReliableIdeaFields,
  type IdeaKind,
} from "../idea-input";
import type { IdeaPageMetadata } from "../idea-page-metadata";
import { propertyTitleFromIdeaSourceUrl } from "../idea-provider-url";
import { quickIdeaCaptureTitle, quickIdeaRouteLabel } from "../quick-idea-title";
import type { ResearchItem } from "../types";
import { QuickIdeaDetails } from "./quick-idea-details";
import { QuickIdeaDuplicateNotice } from "./quick-idea-duplicate-notice";
import { ideaKindLabels, ideaKindSaveLabels, QuickIdeaKindPicker } from "./quick-idea-kind-picker";

export function QuickIdeaInput({
  items,
  onSaved,
  tripId,
}: {
  items: ResearchItem[];
  onSaved: (item: ResearchItem) => void;
  tripId: string;
}) {
  const { t } = useI18n();
  const sync = useResearchSync(tripId);
  const scope = useDraftScope(tripId, "ideas");
  const draft = useDurableFields(editingStorageKey(scope, "quick"), {
    input: "",
    override: null as Exclude<IdeaKind, "unknown"> | null,
    metadata: null as IdeaPageMetadata | null,
    place: null as PlaceSnapshot | null,
    originPlace: null as PlaceSnapshot | null,
    destinationPlace: null as PlaceSnapshot | null,
  });
  const { input, override, metadata, place, originPlace, destinationPlace } = draft.values;
  const setInput = (value: string) => draft.set("input", value);
  const setOverride = (value: typeof override) => draft.set("override", value);
  const setMetadata = (value: typeof metadata) => draft.set("metadata", value);
  const setPlace = (value: typeof place) => draft.set("place", value);
  const setOriginPlace = (value: typeof originPlace) => draft.set("originPlace", value);
  const setDestinationPlace = (value: typeof destinationPlace) =>
    draft.set("destinationPlace", value);
  const [showTypes, setShowTypes] = useState(false);
  const [pending, setPending] = useState(false);
  const [duplicate, setDuplicate] = useState<ResearchItem>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const inferred = useMemo(() => classifyIdeaInput(input), [input]);
  const classification = override ? overrideIdeaClassification(inferred, override) : inferred;
  const preview = useMemo(
    () => parseReliableIdeaFields(classification.sourceUrl),
    [classification.sourceUrl],
  );
  const providerTitle = useMemo(
    () => propertyTitleFromIdeaSourceUrl(classification.sourceUrl),
    [classification.sourceUrl],
  );
  const route = quickIdeaRouteLabel(preview, classification, t("Car"));
  const textCandidate = classification.sourceUrl
    ? input.replace(classification.sourceUrl, "").trim()
    : input.trim();
  const candidateLocation =
    preview.locationText ??
    providerTitle ??
    metadata?.locationText ??
    (classification.kind === "stay" || classification.kind === "activity"
      ? (metadata?.title ?? textCandidate) || null
      : null);
  const lastReported = useRef("");
  const inputRevision = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const metadataReceiver = useRef(setMetadata);
  useEffect(() => {
    metadataReceiver.current = setMetadata;
  });
  const receiveMetadata = useCallback(
    (value: IdeaPageMetadata | null) => metadataReceiver.current(value),
    [],
  );

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") !== "1") return;
    inputRef.current?.focus();
    inputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  useEffect(() => {
    const signature = `${inferred.kind}:${inferred.method}:${inferred.error ?? ""}`;
    if (!input.trim() || signature === lastReported.current) return;
    lastReported.current = signature;
    captureBrowserProductEvent(
      "idea_input_classified",
      {
        idea_kind: inferred.kind,
        classification_method: inferred.method,
        operation_id: newTelemetryOperationId(),
        surface: "ideas_input",
      },
      { actorType: "authenticated" },
    );
  }, [inferred, input]);

  function choose(kind: Exclude<IdeaKind, "unknown">) {
    if (kind !== inferred.kind)
      captureBrowserProductEvent(
        "idea_classification_overridden",
        {
          idea_kind: kind,
          classification_method: "user",
          operation_id: newTelemetryOperationId(),
          surface: "ideas_input",
        },
        { actorType: "authenticated" },
      );
    inputRevision.current++;
    setOverride(kind);
    setShowTypes(false);
  }

  function clearInput() {
    setInput("");
    setOverride(null);
    setShowTypes(false);
    setMetadata(null);
    setPlace(null);
    setOriginPlace(null);
    setDestinationPlace(null);
    setDuplicate(undefined);
  }

  async function save(forceSeparate = false) {
    if (scope[1] !== "guest" && !sync) {
      setError(
        "Ideas sync is unavailable. Your local draft is kept; download it before reloading.",
      );
      return;
    }
    if (!input.trim() || classification.kind === "unknown" || classification.error || pending)
      return;
    const existing = findDuplicateIdea(classification.sourceUrl, items);
    if (existing && !forceSeparate) {
      setDuplicate(existing);
      return;
    }
    const submittedRevision = inputRevision.current;
    if (!draft.persist()) return;
    setPending(true);
    setError(undefined);
    const operationId = newTelemetryOperationId();
    const shareText = input.trim();
    const textOnly = classification.sourceUrl
      ? shareText.replace(classification.sourceUrl, "").trim()
      : shareText;
    const captureInput = {
      kind: classification.kind,
      originPlaceSnapshot: originPlace,
      destinationPlaceSnapshot:
        preview.originText && preview.originText === preview.destinationText
          ? originPlace
          : destinationPlace,
      locationPlaceSnapshot: place,
      locationText: place?.displayName ?? candidateLocation,
      operationId,
      shareText,
      sourceUrl: classification.sourceUrl,
      title: quickIdeaCaptureTitle(textOnly, classification.kind, route),
      tripId,
    };
    let result;
    try {
      result = sync
        ? { data: sync.accept({ kind: "capture", input: captureInput }) }
        : await captureIdea(captureInput);
    } catch (failure) {
      setPending(false);
      setError(failure instanceof Error ? failure.message : String(failure));
      return;
    }
    setPending(false);
    if (!result.data) {
      setError(result.error ?? t("The idea could not be saved."));
      return;
    }
    onSaved(result.data);
    captureBrowserProductEvent(
      "idea_saved",
      { idea_kind: classification.kind, operation_id: operationId, surface: "ideas_input" },
      { actorType: "authenticated" },
    );
    if (inputRevision.current === submittedRevision) clearInput();
    setNotice(t(sync ? "Saved locally" : "Idea saved"));
  }

  async function merge() {
    if (scope[1] !== "guest" && !sync) {
      setError(
        "Ideas sync is unavailable. Your local draft is kept; download it before reloading.",
      );
      return;
    }
    if (!duplicate || !classification.sourceUrl || pending) return;
    const submittedRevision = inputRevision.current;
    if (!draft.persist()) return;
    setPending(true);
    setError(undefined);
    const mergeInput = {
      expectedVersion: duplicate.version,
      operationId: newTelemetryOperationId(),
      researchItemId: duplicate.id,
      shareText: input.trim(),
      sourceUrl: classification.sourceUrl,
      tripId,
    };
    let result;
    try {
      result = sync
        ? { data: sync.accept({ kind: "merge", input: mergeInput }, duplicate), error: undefined }
        : await mergeIdeaSource(mergeInput);
    } catch (failure) {
      setPending(false);
      setError(failure instanceof Error ? failure.message : String(failure));
      return;
    }
    setPending(false);
    if (!result.data) {
      setError(result.error ?? t("The idea could not be saved."));
      return;
    }
    onSaved(result.data);
    if (inputRevision.current === submittedRevision) clearInput();
    setNotice(t(sync ? "Saved locally" : "Source added to saved idea"));
  }

  return (
    <section
      aria-label={t("Save an idea")}
      className="min-w-0 rounded-2xl border bg-card p-4 shadow-sm"
    >
      {draft.error ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
          <T message="Local save failed" />
          <Button type="button" onClick={draft.download}>
            <T message="Download draft" />
          </Button>
          <Button type="button" onClick={draft.retry}>
            <T message="Retry" />
          </Button>
        </div>
      ) : null}
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">
          <T message="Save an idea" />
        </h2>
        {classification.kind !== "unknown" ? (
          <Button
            aria-expanded={showTypes}
            className="min-h-10 rounded-full px-3"
            onClick={() => setShowTypes((current) => !current)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <T message={ideaKindLabels[classification.kind]} />
            <ChevronDown aria-hidden="true" className="size-4" />
          </Button>
        ) : null}
      </div>
      <textarea
        className="min-h-20 w-full min-w-0 resize-y rounded-xl border bg-background px-3 py-3 text-base"
        maxLength={5000}
        onChange={(event) => {
          inputRevision.current++;
          setInput(event.target.value);
          setPlace(null);
          setOriginPlace(null);
          setDestinationPlace(null);
          setOverride(null);
          setShowTypes(false);
          setMetadata(null);
          setDuplicate(undefined);
          setError(undefined);
          setNotice(undefined);
        }}
        placeholder={t("Paste a link or write one sentence")}
        ref={inputRef}
        value={input}
      />
      {input.trim() ? (
        <div className="mt-3 space-y-3">
          {classification.error ? (
            <p className="text-sm text-destructive" role="alert">
              <T message="Enter a complete http or https link." />
            </p>
          ) : null}
          {classification.kind === "unknown" || showTypes ? (
            <QuickIdeaKindPicker current={classification.kind} onChoose={choose} />
          ) : null}
          <QuickIdeaDetails
            resolutionKey={draft.key}
            candidateLocation={candidateLocation}
            classification={classification}
            destinationPlace={destinationPlace}
            metadata={metadata}
            onDestinationPlaceChange={(value) => {
              inputRevision.current++;
              setDestinationPlace(value);
            }}
            onMetadata={receiveMetadata}
            onOriginPlaceChange={(value) => {
              inputRevision.current++;
              setOriginPlace(value);
            }}
            onPlaceChange={(value) => {
              inputRevision.current++;
              setPlace(value);
            }}
            originPlace={originPlace}
            place={place}
            preview={preview}
            providerTitle={providerTitle}
            route={route}
          />
        </div>
      ) : null}
      {duplicate ? (
        <QuickIdeaDuplicateNotice
          onMerge={() => void merge()}
          onSaveSeparately={() => void save(true)}
          pending={pending}
        />
      ) : null}
      <div className="mt-3 flex min-h-11 items-center justify-between gap-3">
        <span
          className={error ? "text-sm text-destructive" : "text-sm text-emerald-700"}
          role={error ? "alert" : "status"}
        >
          {error ?? notice}
        </span>
        <Button
          className="min-h-11 shrink-0"
          disabled={
            !input.trim() ||
            !!classification.error ||
            classification.kind === "unknown" ||
            pending ||
            !!duplicate
          }
          onClick={() => void save()}
          type="button"
        >
          {pending
            ? t("Saving…")
            : classification.kind === "unknown"
              ? t("Choose a type")
              : t(ideaKindSaveLabels[classification.kind])}
        </Button>
      </div>
    </section>
  );
}
