"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";

import { useAppViewport } from "@/lib/use-app-viewport";

import type { PublicMapSelection } from "../../components/public-map-workspace";
import type {
  OwnerShareImageState,
  PublicItinerary,
  PublicItineraryLink,
  PublicView,
  ShareImageManifest,
} from "../../types";
import type { CompiledPublicTemplateV1 } from "../schema";

type PublicTemplateController = {
  desktopMap: boolean;
  itinerary: PublicItinerary;
  mapSheetOpen: boolean;
  mapVisible: boolean;
  ownerImageState: OwnerShareImageState | null;
  ownerSharePage: PublicItineraryLink | null;
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
  ownerImageState,
  ownerSharePage,
  publicUrl,
  shareImage,
  template,
  token,
}: {
  children: ReactNode;
  initialView: PublicView;
  itinerary: PublicItinerary;
  legacyTemplateOverride?: "bento" | "standard";
  ownerImageState: OwnerShareImageState | null;
  ownerSharePage: PublicItineraryLink | null;
  publicUrl: string;
  shareImage: ShareImageManifest | null;
  template: CompiledPublicTemplateV1;
  token: string;
}) {
  const [view, setView] = useState<PublicView>(initialView);
  const [mapVisible, setMapVisible] = useState(itinerary.settings.showMapRoutes);
  const [mapSheetOpen, setMapSheetOpen] = useState(false);
  const [desktopMap, setDesktopMap] = useState(false);
  const [split, setSplit] = useState(64);
  const [selection, setSelection] = useState<PublicMapSelection>({});
  const shellRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const showMap = itinerary.settings.showMapRoutes;
  useAppViewport();

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
    nextParams.set("view", initialView);
    if (nextParams.toString() === searchParams.toString()) return;
    window.history.replaceState(window.history.state, "", `${pathname}?${nextParams.toString()}`);
  }, [initialView, legacyTemplateOverride, pathname, searchParams]);

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
      setSelection({});
      setView(nextView);
    }
    window.history.replaceState(window.history.state, "", `${pathname}?${nextParams.toString()}`);
  }

  function selectDay(dayRef: string) {
    setSelection((current) => ({
      dayRef,
      scope: current.dayRef === dayRef && !current.itemRef ? current.scope : undefined,
    }));
  }

  function selectItem(itemRef: string, dayRef: string) {
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
        itinerary,
        mapSheetOpen,
        mapVisible,
        ownerImageState,
        ownerSharePage,
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
