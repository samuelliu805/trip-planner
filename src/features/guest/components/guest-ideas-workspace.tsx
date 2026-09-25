"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { T, useI18n } from "@/features/i18n/i18n-provider";
import { ResearchItemDialog } from "@/features/research/components/research-item-dialog";
import {
  researchCategoryLabels,
  researchCategories,
  type ResearchCategory,
  type ResearchItem,
  type ResearchMutationResult,
} from "@/features/research/types";
import type { CreateResearchItemInput } from "@/features/research/schema";
import { TripAppBar } from "@/features/trips/components/trip-app-bar";
import type { GuestTripDraft } from "../schema";
import type { CommitGuestDraft } from "../mutations";
import { applyGuestIdea } from "../apply-idea";
import { guestQuickIdeaInput } from "../guest-quick-idea";
import {
  appliedGuestIdeaId,
  removeGuestIdea,
  researchItemFromGuestIdea,
  saveGuestIdea,
} from "../idea-records";
import { GuestIdeaDialogs } from "./guest-idea-dialogs";
import { GuestSaveStatus } from "./guest-save-status";
import type { GuestSaveState } from "../use-guest-draft";

type GuestIdeasWorkspaceProps = {
  commit: CommitGuestDraft;
  draft: GuestTripDraft;
  onOpenPlan: () => void;
  onSaveToAccount: () => void;
  onShare: () => void;
  saveState: GuestSaveState;
};

export function GuestIdeasWorkspace({
  commit,
  draft,
  onOpenPlan,
  onSaveToAccount,
  onShare,
  saveState,
}: GuestIdeasWorkspaceProps) {
  const { t } = useI18n();
  const [category, setCategory] = useState<ResearchCategory>("flight");
  const [quickInput, setQuickInput] = useState("");
  const [reviewId, setReviewId] = useState<string>();
  const [deleteId, setDeleteId] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const ideas = useMemo(() => draft.ideas.map(researchItemFromGuestIdea), [draft.ideas]);
  const visible = ideas.filter((idea) => idea.category === category);

  async function localSave(
    input: CreateResearchItemInput,
    existingId?: string,
  ): Promise<ResearchMutationResult<ResearchItem>> {
    try {
      let saved: ResearchItem | undefined;
      commit((current) => {
        const result = saveGuestIdea(current, input, existingId);
        saved = researchItemFromGuestIdea(result.idea);
        return result.draft;
      });
      setNotice(t("Idea saved"));
      setError(undefined);
      return { data: saved! };
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : "The idea could not be saved." };
    }
  }

  async function saveQuickIdea() {
    const text = quickInput.trim();
    if (!text) return;
    try {
      const quick = guestQuickIdeaInput(text, category, draft.draftId);
      const result = await localSave(quick.input);
      if (!result.data) return setError(result.error);
      setQuickInput("");
      setCategory(quick.category);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The idea could not be saved.");
    }
  }

  function applyIdea() {
    if (!reviewId) return;
    try {
      commit((current) => applyGuestIdea(current, reviewId));
      setReviewId(undefined);
      setNotice(t("Added to Plan"));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The idea could not be added.");
    }
  }

  return (
    <div
      className="trip-detail-page flex h-full min-w-0 flex-col overflow-hidden"
      data-guest-ideas=""
    >
      <TripAppBar
        accountEmail="Local guest"
        active="compare"
        guestExperience={{
          onOpenIdeas: () => undefined,
          onOpenPlan,
          onSaveToAccount,
          onShare,
          saveStatus: <GuestSaveStatus state={saveState} />,
        }}
        title={draft.trip.title}
        tripId={draft.draftId}
        variantControls={
          <span className="block truncate text-sm font-extrabold sm:text-base">
            {draft.trip.title}
          </span>
        }
        variantId={draft.workspace.variant.id}
      />
      <div className="trip-detail-scroller min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 sm:px-6">
          <div>
            <h2 className="text-xl font-bold">
              <T message="Ideas & Options" />
            </h2>
            <p className="text-sm text-muted-foreground">
              <T message="Saved in this browser until you save the trip to an account." />
            </p>
          </div>
          <div
            className="flex min-w-0 flex-wrap gap-2 sm:flex-nowrap sm:overflow-x-auto"
            role="tablist"
            aria-label="Idea categories"
            data-i18n-aria-label="Idea categories"
          >
            {researchCategories.map((candidate) => (
              <Button
                aria-selected={category === candidate}
                className="min-h-11 shrink-0"
                key={candidate}
                onClick={() => setCategory(candidate)}
                role="tab"
                type="button"
                variant={category === candidate ? "default" : "outline"}
              >
                <T message={researchCategoryLabels[candidate]} />
              </Button>
            ))}
          </div>
          <div className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-3 sm:flex-row">
            <Input
              aria-label={t("Paste a link or write an idea")}
              className="min-h-11 min-w-0 flex-1"
              onChange={(event) => setQuickInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void saveQuickIdea();
                }
              }}
              placeholder={t("Paste a link or write an idea")}
              value={quickInput}
            />
            <Button
              className="min-h-11"
              disabled={!quickInput.trim()}
              onClick={() => void saveQuickIdea()}
            >
              <T message="Save idea" />
            </Button>
          </div>
          <div className="flex min-w-0 items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              <T message="Saved ideas" /> · {visible.length}
            </p>
            <ResearchItemDialog
              category={category}
              defaultCurrency={draft.trip.currency}
              localSave={localSave}
              onSaved={() => undefined}
              tripId={draft.draftId}
            />
          </div>
          {notice ? (
            <p className="text-sm text-emerald-700" role="status">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          {visible.length ? (
            visible.map((idea) => {
              const applied = draft.workspace.days.some((day) =>
                day.items.some((item) => appliedGuestIdeaId(item.details) === idea.id),
              );
              return (
                <article className="min-w-0 space-y-3 rounded-xl border bg-card p-4" key={idea.id}>
                  <div className="min-w-0">
                    <h3 className="break-words font-semibold">
                      {idea.title || idea.source_url || idea.note}
                    </h3>
                    {idea.origin_text &&
                    idea.destination_text &&
                    idea.title !== `${idea.origin_text} → ${idea.destination_text}` ? (
                      <p className="text-sm text-muted-foreground">
                        {idea.origin_text} → {idea.destination_text}
                      </p>
                    ) : null}
                    {idea.start_date ? (
                      <p className="text-xs text-muted-foreground">
                        {idea.start_date}
                        {idea.end_date ? ` – ${idea.end_date}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <ResearchItemDialog
                      category={category}
                      defaultCurrency={draft.trip.currency}
                      item={idea}
                      localSave={localSave}
                      onSaved={() => undefined}
                      tripId={draft.draftId}
                    />
                    <Button
                      className="min-h-11"
                      disabled={applied}
                      onClick={() => {
                        setError(undefined);
                        setReviewId(idea.id);
                      }}
                      size="sm"
                    >
                      <T message={applied ? "In Plan" : "Add to Plan"} />
                    </Button>
                    <Button
                      aria-label={t("Delete idea")}
                      className="size-11 p-0"
                      onClick={() => setDeleteId(idea.id)}
                      size="sm"
                      variant="outline"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </Button>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              <T message="No ideas here yet." />
            </div>
          )}
        </div>
      </div>
      <GuestIdeaDialogs
        draft={draft}
        reviewId={reviewId}
        deleteId={deleteId}
        error={error}
        onApply={applyIdea}
        onDelete={(id) => commit((current) => removeGuestIdea(current, id))}
        onReviewChange={setReviewId}
        onDeleteChange={setDeleteId}
      />
    </div>
  );
}
