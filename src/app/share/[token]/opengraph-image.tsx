import { ImageResponse } from "next/og";
import { z } from "zod";

import { getRequestLocale } from "@/features/i18n/server";
import { translateMessage } from "@/features/i18n/translate";
import { getPublicItinerary } from "@/features/sharing/data";
import { localizeGeneratedPublicDescription } from "@/features/sharing/public-copy";

export const alt = "Trip Planner 行程";
export const contentType = "image/png";
export const size = { height: 630, width: 1200 };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OpenGraphImage({ params }: { params: Promise<{ token: string }> }) {
  const [{ token }, locale] = await Promise.all([params, getRequestLocale()]);
  const itinerary = z.uuid().safeParse(token).success ? await getPublicItinerary(token) : null;
  const title = itinerary?.metadata.title ?? translateMessage(locale, "Trip Planner");
  const description = itinerary
    ? localizeGeneratedPublicDescription(itinerary.metadata.description, locale)
    : translateMessage(locale, "Shared itinerary");
  const cities = itinerary?.metadata.coverCities.slice(0, 3).join(" · ") ?? "";
  return new ImageResponse(
    <div
      style={{
        alignItems: "stretch",
        background: "#f8f7f2",
        color: "#18241f",
        display: "flex",
        height: "100%",
        padding: "64px",
        width: "100%",
      }}
    >
      <div style={{ border: "2px solid #d9ded9", display: "flex", flex: 1 }}>
        <div style={{ background: "#166b4f", display: "flex", width: "18px" }} />
        <div
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "58px",
          }}
        >
          <div
            style={{
              color: "#166b4f",
              display: "flex",
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: locale === "zh-CN" ? "0.04em" : "0.16em",
              textTransform: locale === "zh-CN" ? "none" : "uppercase",
            }}
          >
            {translateMessage(locale, "Trip Planner")}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 54, fontWeight: 700, lineHeight: 1.08 }}>
              {title}
            </div>
            <div
              style={{
                color: "#66716b",
                display: "flex",
                fontSize: 25,
                lineHeight: 1.4,
                marginTop: 24,
              }}
            >
              {description}
            </div>
          </div>
          <div style={{ color: "#166b4f", display: "flex", fontSize: 22, fontWeight: 600 }}>
            {cities || translateMessage(locale, "Overview · Table · Timeline")}
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
