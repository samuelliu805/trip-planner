"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { formatMoney } from "../money";
import type { ResearchItem } from "../types";
import { IdeaLinkPreview } from "./idea-link-preview";
import { QuickIdeaDuplicateNotice } from "./quick-idea-duplicate-notice";
import { ideaKindLabels, ideaKindSaveLabels, QuickIdeaKindPicker } from "./quick-idea-kind-picker";
import { QuickIdeaPlaceConfirmation } from "./quick-idea-place-confirmation";

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
  const [input, setInput] = useState("");
  const [override, setOverride] = useState<Exclude<IdeaKind, "unknown"> | null>(null);
  const [showTypes, setShowTypes] = useState(false);
  const [metadata, setMetadata] = useState<IdeaPageMetadata | null>(null);
  const [place, setPlace] = useState<PlaceSnapshot | null>(null);
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
  const route =
    preview.originText && preview.destinationText
      ? `${preview.originText} → ${preview.destinationText}`
      : preview.originText;
  const textCandidate = classification.sourceUrl
    ? input.replace(classification.sourceUrl, "").trim()
    : input.trim();
  const candidateLocation =
    preview.locationText ??
    metadata?.locationText ??
    (classification.kind === "stay" || classification.kind === "activity"
      ? (metadata?.title ?? textCandidate) || null
      : null);
  const priceAmount = preview.priceAmount ?? metadata?.priceAmount ?? null;
  const priceCurrency = preview.priceCurrency ?? metadata?.priceCurrency ?? null;
  const services = preview.segments
    ?.map((segment) => [segment.carrier, segment.serviceNumber].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(" · ");
  const lastReported = useRef("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const receiveMetadata = useCallback((value: IdeaPageMetadata | null) => setMetadata(value), []);

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
    setOverride(kind);
    setShowTypes(false);
  }

  function clearInput() {
    setInput("");
    setOverride(null);
    setShowTypes(false);
    setMetadata(null);
    setPlace(null);
    setDuplicate(undefined);
  }

  async function save(forceSeparate = false) {
    if (!input.trim() || classification.kind === "unknown" || classification.error || pending)
      return;
    const existing = findDuplicateIdea(classification.sourceUrl, items);
    if (existing && !forceSeparate) {
      setDuplicate(existing);
      return;
    }
    setPending(true);
    setError(undefined);
    const operationId = newTelemetryOperationId();
    const shareText = input.trim();
    const textOnly = classification.sourceUrl
      ? shareText.replace(classification.sourceUrl, "").trim()
      : shareText;
    const result = await captureIdea({
      kind: classification.kind,
      locationPlaceSnapshot: place,
      locationText: place?.displayName ?? candidateLocation,
      operationId,
      shareText,
      sourceUrl: classification.sourceUrl,
      title: textOnly ? textOnly.slice(0, 300) : route,
      tripId,
    });
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
    clearInput();
    setNotice(t("Idea saved"));
  }

  async function merge() {
    if (!duplicate || !classification.sourceUrl || pending) return;
    setPending(true);
    setError(undefined);
    const result = await mergeIdeaSource({
      expectedVersion: duplicate.version,
      operationId: newTelemetryOperationId(),
      researchItemId: duplicate.id,
      shareText: input.trim(),
      sourceUrl: classification.sourceUrl,
      tripId,
    });
    setPending(false);
    if (!result.data) {
      setError(result.error);
      return;
    }
    onSaved(result.data);
    clearInput();
    setNotice(t("Source added to saved idea"));
  }

  return (
    <section
      aria-label={t("Save an idea")}
      className="min-w-0 rounded-2xl border bg-card p-4 shadow-sm"
    >
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
          setInput(event.target.value);
          setPlace(null);
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
          {route || candidateLocation || preview.startDate || priceAmount !== null ? (
            <p className="flex flex-wrap gap-x-2 gap-y-1 text-sm text-muted-foreground">
              {route || candidateLocation ? <span>{route || candidateLocation}</span> : null}
              {preview.startDate ? (
                <span>
                  {preview.endDate
                    ? `${preview.startDate} – ${preview.endDate}`
                    : preview.startDate}
                </span>
              ) : null}
              {services ? <span>{services}</span> : null}
              {priceAmount !== null && priceCurrency ? (
                <strong className="text-foreground">
                  {formatMoney(priceAmount, priceCurrency)}
                </strong>
              ) : null}
            </p>
          ) : null}
          <IdeaLinkPreview
            hasReliableFields={Boolean(
              (route || candidateLocation) && preview.startDate && priceAmount !== null,
            )}
            key={classification.sourceUrl ?? ""}
            onResult={receiveMetadata}
            sourceUrl={classification.sourceUrl}
          />
          {(classification.kind === "stay" || classification.kind === "activity") &&
          candidateLocation ? (
            <QuickIdeaPlaceConfirmation
              candidate={candidateLocation}
              onChange={setPlace}
              sourceKey={classification.sourceUrl ?? "manual"}
              value={place}
            />
          ) : null}
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
