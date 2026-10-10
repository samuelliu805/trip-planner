"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { plannerQueryKey } from "../itinerary/planner-query";
import type { PlannerVariant, PlannerWorkspace } from "../itinerary/types";
import { useVariantSync } from "./use-variant-sync";

/** Pending Plans are browser workspaces with the same stable IDs as their eventual rows. */
export function useLocalPlanNavigation(initial: PlannerWorkspace, variants: PlannerVariant[]) {
  const tripId = initial.variant.trip_id;
  const client = useQueryClient();
  const runtime = useVariantSync(tripId, variants);
  const [selected, setSelected] = useState<PlannerWorkspace>();
  useEffect(() => {
    const restore = () => {
      const id = new URL(window.location.href).searchParams.get("variant");
      if (!id || id === initial.variant.id) {
        setSelected(undefined);
        return;
      }
      const cached = client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, id));
      if (cached && runtime?.project().some((row) => row.id === id)) setSelected(cached);
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [client, initial.variant.id, runtime, tripId]);

  function navigate(id: string) {
    const cached =
      id === initial.variant.id
        ? initial
        : client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, id));
    if (!cached || !runtime?.project().some((row) => row.id === id)) return false;
    const url = new URL(window.location.href);
    url.searchParams.set("variant", id);
    for (const key of ["item", "settings", "share"]) url.searchParams.delete(key);
    window.history.pushState(null, "", url);
    setSelected(cached);
    return true;
  }
  return { workspace: selected ?? initial, navigate };
}
