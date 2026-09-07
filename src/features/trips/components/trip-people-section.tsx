"use client";

import { LoaderCircle, UserMinus, UserPlus, Users } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { T } from "@/features/i18n/i18n-provider";
import {
  inviteTripCollaborator,
  removeTripCollaborator,
} from "@/features/trips/collaboration-actions";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import type { TripMember, TripRole } from "@/platform/contracts/trips";

export function TripPeopleSection({ role, tripId }: { role: TripRole; tripId: string }) {
  const cn = process.env.NEXT_PUBLIC_APP_REGION === "cn";
  const [members, setMembers] = useState<TripMember[]>([]);
  const [identifier, setIdentifier] = useState("");
  const [feedback, setFeedback] = useState<{ error?: string; success?: string }>({});
  const [pending, startTransition] = useTransition();

  async function loadMembers() {
    const response = await fetch(`/api/trips/${tripId}/members`, { cache: "no-store" });
    if (!response.ok) throw new Error("Trip members could not be loaded.");
    setMembers(((await response.json()) as { members: TripMember[] }).members);
  }

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/trips/${tripId}/members`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Trip members could not be loaded.");
        return ((await response.json()) as { members: TripMember[] }).members;
      })
      .then((loaded) => {
        if (!cancelled) setMembers(loaded);
      })
      .catch(() => {
        if (!cancelled) setFeedback({ error: "Trip members could not be loaded." });
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  function invite() {
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
    <section
      className="space-y-3 rounded-xl border bg-muted/25 p-4"
      aria-labelledby="trip-people-heading"
    >
      <div className="flex items-center gap-2">
        <Users aria-hidden="true" className="size-4 text-primary" />
        <h2 className="text-sm font-extrabold" id="trip-people-heading">
          <T message={"People"} />
        </h2>
      </div>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
        <Input
          aria-label={cn ? "Phone number" : "Email address"}
          autoComplete={cn ? "tel" : "email"}
          className="min-h-11 min-w-0"
          inputMode={cn ? "tel" : "email"}
          onChange={(event) => setIdentifier(event.currentTarget.value)}
          placeholder={cn ? "+86 138 0013 8000" : "traveler@example.com"}
          type={cn ? "tel" : "email"}
          value={identifier}
        />
        <Button
          className="min-h-11 shrink-0"
          disabled={pending || !identifier.trim()}
          onClick={invite}
          type="button"
        >
          {pending ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <UserPlus aria-hidden="true" className="size-4" />
          )}
          <T message={"Invite"} />
        </Button>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        <T message={"Only registered accounts are added. No email or text message is sent."} />
      </p>
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
      {feedback.error ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {feedback.error}
        </p>
      ) : null}
      {feedback.success ? (
        <p className="text-sm font-medium text-primary" role="status">
          {feedback.success}
        </p>
      ) : null}
    </section>
  );
}
