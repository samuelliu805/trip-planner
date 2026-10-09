"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { suspendAccountQueues, resumeAccountQueues } from "./account-runtime";
import { recoverDraftActivities } from "./sync-registry";
import { useQueryClient } from "@tanstack/react-query";
import { observeConfirmedAttachments } from "../attachments/confirmed-attachments";

const DraftScope = createContext("guest");

export function DraftScopeProvider({
  actorId,
  children,
}: {
  actorId: string;
  children: ReactNode;
}) {
  const client = useQueryClient();
  useEffect(() => {
    let current = true;
    const stopAttachments = observeConfirmedAttachments(actorId, client);
    const resume = () => {
      try {
        recoverDraftActivities(window.localStorage, actorId);
      } catch {
        /* Editors retain and expose failed local writes. */
      }
      resumeAccountQueues(actorId);
      if (actorId !== "guest")
        void import("./recover-account-work")
          .then((module) => {
            if (current) module.recoverAccountWork(actorId, client);
          })
          .catch(() => {
            /* A local write failure remains visible in its owning editor. */
          });
      if (actorId !== "guest")
        void import("../attachments/upload-owners")
          .then((module) => {
            if (current) return module.restoreAccountUploads(actorId);
          })
          .catch(() => {
            /* Upload controls expose storage recovery errors. */
          });
    };
    resume();
    window.addEventListener("online", resume);
    window.addEventListener("storage", resume);
    return () => {
      current = false;
      stopAttachments();
      window.removeEventListener("online", resume);
      window.removeEventListener("storage", resume);
      suspendAccountQueues(actorId);
    };
  }, [actorId, client]);
  return (
    <DraftScope.Provider
      value={actorId}
      key={`${process.env.NEXT_PUBLIC_APP_REGION ?? "global"}:${actorId}`}
    >
      {children}
    </DraftScope.Provider>
  );
}

export function useDraftScope(tripId: string, variantId: string) {
  const actor = useContext(DraftScope);
  return [process.env.NEXT_PUBLIC_APP_REGION ?? "global", actor, tripId, variantId];
}
