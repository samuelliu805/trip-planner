"use client";

import { LoaderCircle, UserMinus, Users } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SheetTitle } from "@/components/ui/sheet";
import { Localized, T } from "@/features/i18n/i18n-provider";
import { PlannerEditorField } from "@/features/itinerary/components/planner-editor-fields";
import { PlannerEditorForm } from "@/features/itinerary/components/planner-editor-form";
import { PlannerEditorScreen } from "@/features/itinerary/components/planner-editor-screen";
import {
  inviteTripCollaborator,
  removeTripCollaborator,
} from "@/features/trips/collaboration-actions";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import type { TripMember, TripRole } from "@/platform/contracts/trips";

export function TripPeopleEditor({
  onOpenChange,
  open,
  role,
  tripId,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  role: TripRole;
  tripId: string;
}) {
  const cn = process.env.NEXT_PUBLIC_APP_REGION === "cn";
  const [members, setMembers] = useState<TripMember[]>([]);
  const [identifier, setIdentifier] = useState("");
  const [feedback, setFeedback] = useState<{ error?: string; success?: string }>({});
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  const loadMembers = useCallback(async () => {
    const response = await fetch(`/api/trips/${tripId}/members`, { cache: "no-store" });
    if (!response.ok) throw new Error("Trip members could not be loaded.");
    setMembers(((await response.json()) as { members: TripMember[] }).members);
  }, [tripId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.resolve()
      .then(() => {
        if (!cancelled) setLoading(true);
        return loadMembers();
      })
      .catch(() => {
        if (!cancelled) setFeedback({ error: "Trip members could not be loaded." });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadMembers, open]);

  function invite() {
    if (!identifier.trim()) return;
    startTransition(async () => {
      setFeedback({});
      const result = await inviteTripCollaborator({
        identifier,
        operationId: newTelemetryOperationId(),
        tripId,
      });
      setFeedback(result);
      if (!result.error) {
        setIdentifier("");
        await loadMembers();
      }
    });
  }

  function remove(memberId: string) {
    startTransition(async () => {
      setFeedback({});
      const result = await removeTripCollaborator({
        memberId,
        operationId: newTelemetryOperationId(),
        tripId,
      });
      setFeedback(result);
      if (!result.error) await loadMembers();
    });
  }

  return (
    <PlannerEditorScreen
      editorKind="trip-people"
      initialFocusSelector="[data-trip-people-title]"
      onOpenChange={onOpenChange}
      open={open}
    >
      <PlannerEditorForm
        cancelLabel="Close"
        compactActions
        denseFields
        header={null}
        onCancel={() => onOpenChange(false)}
        onClose={() => onOpenChange(false)}
        onSave={invite}
        pending={pending}
        pendingLabel="Inviting…"
        saveDisabled={!identifier.trim()}
        saveLabel="Invite"
      >
        <div className="flex min-w-0 items-start gap-3 border-b pb-4 sm:gap-4 sm:pb-6">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:size-12 sm:rounded-2xl">
            <Users aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 pt-0.5">
            <SheetTitle
              className="text-lg font-extrabold tracking-tight outline-none sm:text-xl"
              data-trip-people-title=""
              tabIndex={-1}
            >
              <T message="People" />
            </SheetTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              <T message="Invite a registered traveler to edit this trip with you." />
            </p>
          </div>
        </div>

        <PlannerEditorField id="trip-person-identifier" label={cn ? "Phone number" : "Email"}>
          <Input
            aria-label={cn ? "Phone number" : "Email address"}
            autoComplete={cn ? "tel" : "email"}
            className="min-h-11 min-w-0"
            id="trip-person-identifier"
            inputMode={cn ? "tel" : "email"}
            onChange={(event) => setIdentifier(event.currentTarget.value)}
            placeholder={cn ? "+86 138 0013 8000" : "traveler@example.com"}
            type={cn ? "tel" : "email"}
            value={identifier}
          />
        </PlannerEditorField>

        <div className="min-w-0 space-y-2">
          <h2 className="text-sm font-bold">
            <T message="People with access" />
          </h2>
          {loading ? (
            <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground" role="status">
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              <T message="Loading…" />
            </p>
          ) : (
            <ul className="divide-y rounded-lg border bg-background">
              {members.map((member) => (
                <li className="flex min-h-12 items-center gap-3 px-3 py-2" key={member.memberId}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{member.displayLabel}</p>
                    <p className="text-xs capitalize text-muted-foreground">
                      <T message={member.role === "owner" ? "Owner" : "Collaborator"} />
                    </p>
                  </div>
                  {role === "owner" && member.role === "collaborator" ? (
                    <Button
                      aria-label="Remove collaborator"
                      className="size-11 p-0"
                      disabled={pending}
                      onClick={() => remove(member.memberId)}
                      type="button"
                      variant="ghost"
                    >
                      <UserMinus aria-hidden="true" className="size-4" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs leading-5 text-muted-foreground">
            <T message="Only registered accounts are added. No email or text message is sent." />
          </p>
        </div>

        {feedback.error ? (
          <p className="text-sm font-medium text-destructive" role="alert">
            <Localized value={feedback.error} />
          </p>
        ) : null}
        {feedback.success ? (
          <p className="text-sm font-medium text-primary" role="status">
            <Localized value={feedback.success} />
          </p>
        ) : null}
      </PlannerEditorForm>
    </PlannerEditorScreen>
  );
}
