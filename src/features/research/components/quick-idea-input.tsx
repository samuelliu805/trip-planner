"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { T, useI18n } from "@/features/i18n/i18n-provider";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";

import { captureIdea, mergeIdeaSource } from "../idea-actions";
import {
  classifyIdeaInput,
  findDuplicateIdea,
  overrideIdeaClassification,
  type IdeaKind,
} from "../idea-input";
import type { ResearchItem } from "../types";

const kinds = ["flight", "stay", "car", "activity"] as const;
const labels: Record<Exclude<IdeaKind, "unknown">, string> = {
  flight: "Flight",
  stay: "Stay",
  car: "Car",
  activity: "Activity",
};

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
  const [pending, setPending] = useState(false);
  const [duplicate, setDuplicate] = useState<ResearchItem>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const inferred = useMemo(() => classifyIdeaInput(input), [input]);
  const classification = override ? overrideIdeaClassification(inferred, override) : inferred;
  const lastReported = useRef("");

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
    if (inferred.error)
      captureBrowserProductEvent(
        "idea_parser_failed",
        {
          idea_kind: "unknown",
          error_code: "invalid_input",
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
      operationId,
      shareText,
      sourceUrl: classification.sourceUrl,
      title: textOnly ? textOnly.slice(0, 300) : null,
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
      {
        idea_kind: classification.kind,
        operation_id: operationId,
        surface: "ideas_input",
      },
      { actorType: "authenticated" },
    );
    setInput("");
    setOverride(null);
    setDuplicate(undefined);
    setNotice(t("Idea saved"));
  }

  async function merge() {
    if (!duplicate || !classification.sourceUrl || pending) return;
    setPending(true);
    setError(undefined);
    const operationId = newTelemetryOperationId();
    const result = await mergeIdeaSource({
      tripId,
      researchItemId: duplicate.id,
      expectedVersion: duplicate.version,
      operationId,
      sourceUrl: classification.sourceUrl,
      shareText: input.trim(),
    });
    setPending(false);
    if (!result.data) {
      setError(result.error);
      return;
    }
    onSaved(result.data);
    captureBrowserProductEvent(
      "idea_duplicate_merged",
      { idea_kind: classification.kind, operation_id: operationId, surface: "ideas_input" },
      { actorType: "authenticated" },
    );
    setInput("");
    setOverride(null);
    setDuplicate(undefined);
    setNotice(t("Source added to saved idea"));
  }

  return (
    <section
      className="min-w-0 rounded-2xl border bg-card p-4 sm:p-5"
      aria-label={t("Save an idea")}
    >
      <h2 className="text-base font-semibold">
        <T message="Put something you want to keep here" />
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        <T message="Paste a link or write one sentence. This saves it; it does not search the web." />
      </p>
      <label className="mt-3 block">
        <span className="sr-only">
          <T message="Idea link or sentence" />
        </span>
        <textarea
          className="min-h-24 w-full min-w-0 resize-y rounded-xl border bg-background px-3 py-3 text-base"
          maxLength={5000}
          onChange={(event) => {
            setInput(event.target.value);
            setOverride(null);
            setDuplicate(undefined);
            setError(undefined);
            setNotice(undefined);
          }}
          placeholder={t("Paste a link or write one sentence")}
          value={input}
        />
      </label>
      {input.trim() ? (
        <>
          <p className="mt-2 text-sm font-medium" aria-live="polite">
            {classification.kind === "unknown"
              ? t("Not sure yet. Choose a type.")
              : `${t("Recognized as")}: ${t(labels[classification.kind])}`}
          </p>
          {classification.error ? (
            <p className="text-sm text-destructive" role="alert">
              <T message="Enter a complete http or https link." />
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2" aria-label={t("Choose idea type")}>
            {kinds.map((kind) => (
              <Button
                aria-pressed={classification.kind === kind}
                className="min-h-11"
                key={kind}
                onClick={() => choose(kind)}
                type="button"
                variant={classification.kind === kind ? "default" : "outline"}
              >
                {t(labels[kind])}
              </Button>
            ))}
          </div>
        </>
      ) : null}
      {duplicate ? (
        <div className="mt-3 rounded-xl border p-3" role="alert">
          <p className="text-sm">
            <T message="This link is already saved." />
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              className="min-h-11"
              disabled={pending}
              onClick={() => void merge()}
              type="button"
              variant="outline"
            >
              <T message="Merge source" />
            </Button>
            <Button
              className="min-h-11"
              onClick={() => void save(true)}
              type="button"
              variant="outline"
            >
              <T message="Save separately" />
            </Button>
          </div>
        </div>
      ) : null}
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-sm text-destructive" role="alert">
          {error}
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
              : `${t("Save")} ${t(labels[classification.kind])}`}
        </Button>
      </div>
      {notice ? (
        <p className="mt-2 text-sm text-emerald-700" role="status">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
