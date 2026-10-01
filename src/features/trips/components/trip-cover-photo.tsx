"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { T } from "@/features/i18n/i18n-provider";
import {
  createPublicPhotoSession,
  type LoadedPlacePhoto,
} from "@/features/sharing/public-photo-session";
import { publicItemMediaSchema } from "@/features/sharing/schema";
import type { TripCoverSource } from "../cover-selection";
import "./trip-cover-photo.css";

export function TripCoverPhoto({ tripId, source }: { tripId: string; source?: TripCoverSource }) {
  const root = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState<{
    session: ReturnType<typeof createPublicPhotoSession>;
    photo: LoadedPlacePhoto;
  }>();
  const endpoint = `/api/trips/${tripId}/cover-photo`;
  const placeId = source?.googlePlaceId;
  const sourceRef = source?.placeId;
  const session = useMemo(
    () =>
      createPublicPhotoSession({
        sources:
          placeId && sourceRef && process.env.NEXT_PUBLIC_APP_REGION !== "cn"
            ? [{ itemRef: sourceRef, placeId }]
            : [],
        async resolve() {
          const response = await fetch(`${endpoint}?resolve=1`, {
            cache: "no-store",
            signal: AbortSignal.timeout(12_000),
          });
          if (!response.ok) return null;
          const payload = await response.json();
          const url = new URL(payload.url, location.origin);
          if (url.origin !== location.origin || url.pathname !== endpoint) return null;
          const parsed = publicItemMediaSchema.safeParse({ ...payload, url: url.href });
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
    [endpoint, placeId, sourceRef],
  );
  const releaseTimers = useRef(new Map<typeof session, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = releaseTimers.current;
    clearTimeout(timers.get(session));
    timers.delete(session);
    let cancelled = false;
    const observer = new IntersectionObserver((entries) => {
      if (!sourceRef || !entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void session.get(sourceRef).then((photo) => {
        if (photo && !cancelled) setLoaded({ session, photo });
      });
    });
    if (root.current) observer.observe(root.current);
    return () => {
      cancelled = true;
      observer.disconnect();
      timers.set(
        session,
        setTimeout(() => {
          session.dispose();
          timers.delete(session);
        }, 0),
      );
    };
  }, [session, sourceRef]);
  const photo = loaded?.session === session ? loaded.photo : undefined;
  if (!source) return null;
  return (
    <div
      ref={root}
      className={
        photo
          ? "trip-cover-photo pointer-events-none"
          : "trip-cover-photo-observer pointer-events-none absolute right-6 top-16 size-px"
      }
    >
      {photo ? (
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element -- decoded session photo reused as the card backdrop. */}
          <img
            className="absolute inset-0 -z-10 h-full w-full rounded-xl object-cover"
            alt={source.name}
            src={photo.displayUrl}
          />
          <div aria-hidden="true" className="trip-cover-photo-filter" />
          <figcaption className="relative z-10 mx-6 mb-3 break-words text-[10px] leading-relaxed text-foreground/80">
            {(photo.media.attributions ?? []).map((author, index) => (
              <span key={`${author.label}:${index}`}>
                <T message="Photo by" />{" "}
                {author.url ? (
                  <a
                    className="pointer-events-auto inline-flex min-h-11 min-w-11 items-center underline"
                    href={author.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {author.label}
                  </a>
                ) : (
                  author.label
                )}
                {" · "}
              </span>
            ))}
            {photo.media.sourceUrl ? (
              <a
                className="pointer-events-auto inline-flex min-h-11 min-w-11 items-center underline"
                href={photo.media.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <T message="Google Maps" />
              </a>
            ) : (
              <T message="Google Maps" />
            )}
          </figcaption>
        </figure>
      ) : null}
    </div>
  );
}
