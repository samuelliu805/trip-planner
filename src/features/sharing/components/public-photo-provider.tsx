"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { publicGoogleCoverItem } from "../public-media-presentation";
import { publicItemMediaSchema } from "../schema";
import { createPublicPhotoSession, type LoadedPlacePhoto } from "../public-photo-session";
import type { PublicItinerary } from "../types";

const PhotoContext = createContext<ReturnType<typeof createPublicPhotoSession> | null>(null);

export function PublicPhotoProvider({
  children,
  itinerary,
  token,
}: {
  children: ReactNode;
  itinerary: PublicItinerary;
  token: string;
}) {
  // Only photo selection inputs participate. Title/notes/style edits preserve the session.
  const fingerprint = JSON.stringify(
    itinerary.settings.showPlacePhotos === true && process.env.NEXT_PUBLIC_APP_REGION !== "cn"
      ? itinerary.days.flatMap((day) => {
          const item = publicGoogleCoverItem(day);
          return item?.place?.googlePlaceId
            ? [{ itemRef: item.ref, placeId: item.place.googlePlaceId }]
            : [];
        })
      : [],
  );
  const session = useMemo(
    () =>
      createPublicPhotoSession({
        sources: JSON.parse(fingerprint),
        async resolve(itemRef) {
          const response = await fetch(`/api/public-place-photo/${token}/${itemRef}?resolve=1`, {
            cache: "no-store",
            signal: AbortSignal.timeout(12_000),
          });
          if (!response.ok) return null;
          const parsed = publicItemMediaSchema.safeParse(await response.json());
          return parsed.success && parsed.data.source === "google_place" ? parsed.data : null;
        },
        async load(media) {
          const response = await fetch(media.url, {
            cache: "no-store",
            signal: AbortSignal.timeout(12_000),
          });
          if (!response.ok || !response.headers.get("content-type")?.startsWith("image/"))
            return { status: response.status };
          const displayUrl = URL.createObjectURL(await response.blob());
          const image = new Image();
          image.src = displayUrl;
          try {
            await image.decode();
            return { status: response.status, displayUrl };
          } catch {
            URL.revokeObjectURL(displayUrl);
            return { status: 503 };
          }
        },
        release: (url) => URL.revokeObjectURL(url),
      }),
    [fingerprint, token],
  );
  const releaseTimers = useRef(new Map<typeof session, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = releaseTimers.current;
    clearTimeout(timers.get(session));
    timers.delete(session);
    return () => {
      timers.set(
        session,
        setTimeout(() => {
          session.dispose();
          timers.delete(session);
        }, 0),
      );
    };
  }, [session]);
  return <PhotoContext.Provider value={session}>{children}</PhotoContext.Provider>;
}

export function usePublicPlacePhoto(itemRef?: string) {
  const session = useContext(PhotoContext);
  const observerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState<{
    session: typeof session;
    ref: string;
    photo: LoadedPlacePhoto;
  }>();
  useEffect(() => {
    const element = observerRef.current;
    if (!session || !itemRef || !element) return;
    let cancelled = false;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void session.get(itemRef).then((photo) => {
        if (photo && !cancelled) setLoaded({ session, ref: itemRef, photo });
      });
    });
    observer.observe(element);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [itemRef, session]);
  return {
    observerRef,
    photo: loaded?.session === session && loaded?.ref === itemRef ? loaded.photo : undefined,
  };
}
