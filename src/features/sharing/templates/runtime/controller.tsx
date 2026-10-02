"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { flushSync } from "react-dom";
import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";

import type { PublicMapSelection } from "../../components/public-map-workspace";
import { usePublicViewportContainment } from "../../hooks/use-public-viewport-containment";
import type { PublicItinerary, PublicView, ShareImageManifest } from "../../types";
import type { CompiledPublicTemplateV1 } from "../schema";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";
import type { PublicDayIntentRoot } from "./early-day-intent";

type PublicTemplateController = {
  desktopMap: boolean;
  detailItemRef?: string;
  detailTrigger: HTMLElement | null;
  setDetailItemRef: Dispatch<SetStateAction<string | undefined>>;
  itinerary: PublicItinerary;
  mapSheetOpen: boolean;
  mapTrigger: HTMLElement | null;
  setMapTrigger: Dispatch<SetStateAction<HTMLElement | null>>;
  mapVisible: boolean;
  shareImage: ShareImageManifest | null;
  onSelectionChange: Dispatch<SetStateAction<PublicMapSelection>>;
  resize: (event: PointerEvent<HTMLDivElement>) => void;
  selectDay: (dayRef: string) => void;
  selectItem: (itemRef: string, dayRef: string) => void;
  selection: PublicMapSelection;
  setMapSheetOpen: Dispatch<SetStateAction<boolean>>;
  setMapVisible: Dispatch<SetStateAction<boolean>>;
  setSplit: Dispatch<SetStateAction<number>>;
  shareUrl: string;
  shellRef: RefObject<HTMLDivElement | null>;
  showMap: boolean;
  split: number;
  switchView: (view: PublicView) => void;
  template: CompiledPublicTemplateV1;
  token: string;
  view: PublicView;
};

const PublicTemplateControllerContext = createContext<PublicTemplateController | null>(null);

function applyTemplateQuery(
  params: URLSearchParams,
  legacyTemplateOverride?: "bento" | "standard",
) {
  params.delete("templateVersion");
  if (legacyTemplateOverride) params.set("template", legacyTemplateOverride);
  else params.delete("template");
}

export function PublicTemplateControllerProvider({
  children,
  initialView,
  itinerary,
  legacyTemplateOverride,
  publicUrl,
  shareImage,
  template,
  token,
}: {
  children: ReactNode;
  initialView: PublicView;
  itinerary: PublicItinerary;
  legacyTemplateOverride?: "bento" | "standard";
  publicUrl: string;
  shareImage: ShareImageManifest | null;
  template: CompiledPublicTemplateV1;
  token: string;
}) {
  usePublicViewportContainment();
  const [detailItemRef, setDetailItemRef] = useState<string>();
  const [detailTrigger, setDetailTrigger] = useState<HTMLElement | null>(null);
  const [view, setView] = useState<PublicView>(initialView);
  const [mapVisible, setMapVisible] = useState(itinerary.settings.showMapRoutes);
  const [mapSheetOpen, setMapSheetOpen] = useState(false);
  const [mapTrigger, setMapTrigger] = useState<HTMLElement | null>(null);
  const [desktopMap, setDesktopMap] = useState(false);
  const [split, setSplit] = useState(64);
  const [selection, setSelection] = useState<PublicMapSelection>({});
  const dayJumpRef = useRef<string | undefined>(undefined);
  const shellRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const showMap = itinerary.settings.showMapRoutes;
  const exposureReported = useRef(false);

  const replayInitialDay = useEffectEvent(() => {
    const root = shellRef.current?.closest<PublicDayIntentRoot>(".public-itinerary-shell");
    const ref = root?.publicDayIntent;
    if (root) delete root.publicDayIntent;
    if (ref && itinerary.days.some((day) => day.ref === ref)) flushSync(() => selectDay(ref));
  });
  useLayoutEffect(() => {
    const root = shellRef.current?.closest(".public-itinerary-shell");
    const replay = () => replayInitialDay();
    root?.addEventListener("public-reader-ready", replay, { once: true });
    return () => root?.removeEventListener("public-reader-ready", replay);
  }, []);

  useLayoutEffect(() => {
    const dayJump = dayJumpRef.current;
    if (!dayJump || view !== "timeline") return;
    const panel = shellRef.current?.querySelector("#public-timeline-panel");
    const scroller = panel?.querySelector<HTMLElement>(".public-view-scroll");
    const day = Array.from(
      scroller?.querySelectorAll<HTMLElement>("[data-public-day-ref]") ?? [],
    ).find((node) => node.dataset.publicDayRef === dayJump);
    if (day && scroller) {
      scroller.scrollTop += day.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      day.tabIndex = -1;
      day.focus({ preventScroll: true });
      scroller.dispatchEvent(new CustomEvent("public-day-jump", { detail: dayJump }));
    }
    dayJumpRef.current = undefined;
  }, [selection, view]);

  useEffect(() => {
    if (exposureReported.current) return;
    exposureReported.current = true;
    captureBrowserProductEvent(
      "public_share_viewed",
      {
        operation_id: newTelemetryOperationId(),
        public_view: initialView,
        surface: "public_share",
      },
      { actorType: "anonymous" },
    );
  }, [initialView]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 900px) and (max-width: 1199px)");
    const setResponsiveSplit = () => setSplit(media.matches ? 56 : 64);
    setResponsiveSplit();
    media.addEventListener("change", setResponsiveSplit);
    return () => media.removeEventListener("change", setResponsiveSplit);
  }, []);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams.toString());
    applyTemplateQuery(nextParams, legacyTemplateOverride);
    nextParams.set("view", view);
    if (nextParams.toString() === searchParams.toString()) return;
    window.history.replaceState(window.history.state, "", `${pathname}?${nextParams.toString()}`);
  }, [view, legacyTemplateOverride, pathname, searchParams]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 900px)");
    const setDesktop = () => setDesktopMap(media.matches);
    setDesktop();
    media.addEventListener("change", setDesktop);
    return () => media.removeEventListener("change", setDesktop);
  }, []);

  function switchView(nextView: PublicView) {
    const nextParams = new URLSearchParams(searchParams.toString());
    applyTemplateQuery(nextParams, legacyTemplateOverride);
    nextParams.set("view", nextView);
    if (nextView !== view) {
      captureBrowserProductEvent(
        "public_share_view_changed",
        {
          operation_id: newTelemetryOperationId(),
          public_view: nextView,
          surface: "public_share",
        },
        { actorType: "anonymous" },
      );
      setSelection((current) =>
        template.id === "journal" || template.id === "ethereal" ? { dayRef: current.dayRef } : {},
      );
      setView(nextView);
    }
    window.history.replaceState(window.history.state, "", `${pathname}?${nextParams.toString()}`);
  }

  function selectDay(dayRef: string) {
    const root = shellRef.current?.closest<PublicDayIntentRoot>(".public-itinerary-shell");
    if (root) delete root.publicDayIntent;
    if (view !== "table") dayJumpRef.current = dayRef;
    if (view === "overview") switchView("timeline");
    setSelection((current) => ({
      dayRef,
      scope: current.dayRef === dayRef && !current.itemRef ? current.scope : undefined,
    }));
  }

  function selectItem(itemRef: string, dayRef: string) {
    if (template.id === "journal" || template.id === "ethereal") {
      setDetailTrigger(
        document.activeElement instanceof HTMLElement ? document.activeElement : null,
      );
      setDetailItemRef(itemRef);
    }
    setSelection((current) => ({
      dayRef,
      itemRef,
      scope: current.dayRef === dayRef && current.itemRef === itemRef ? current.scope : undefined,
    }));
  }

  function resize(event: PointerEvent<HTMLDivElement>) {
    if (!shellRef.current || event.buttons !== 1) return;
    const bounds = shellRef.current.getBoundingClientRect();
    const next = ((event.clientX - bounds.left) / bounds.width) * 100;
    setSplit(Math.min(75, Math.max(52, Math.round(next))));
  }

  const shareUrl = useMemo(() => {
    const url = new URL(publicUrl);
    if (legacyTemplateOverride) url.searchParams.set("template", legacyTemplateOverride);
    url.searchParams.set("view", view);
    return url.toString();
  }, [legacyTemplateOverride, publicUrl, view]);

  return (
    <PublicTemplateControllerContext.Provider
      value={{
        desktopMap,
        detailItemRef,
        detailTrigger,
        setDetailItemRef,
        itinerary,
        mapSheetOpen,
        mapTrigger,
        setMapTrigger,
        mapVisible,
        shareImage,
        onSelectionChange: setSelection,
        resize,
        selectDay,
        selectItem,
        selection,
        setMapSheetOpen,
        setMapVisible,
        setSplit,
        shareUrl,
        shellRef,
        showMap,
        split,
        switchView,
        template,
        token,
        view,
      }}
    >
      {children}
    </PublicTemplateControllerContext.Provider>
  );
}

export function usePublicTemplateController() {
  const controller = useContext(PublicTemplateControllerContext);
  if (!controller) throw new Error("Public template parts require the platform controller.");
  return controller;
}
