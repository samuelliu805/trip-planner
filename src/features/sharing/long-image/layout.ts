import type { PublicItineraryDay } from "../types";

export const TIMELINE_EXPORT_WIDTH = 1080;
export const TIMELINE_EXPORT_CSS_WIDTH = 540;
export const TIMELINE_EXPORT_PIXEL_RATIO = 2;
export const TIMELINE_EXPORT_MAX_HEIGHT = 9_600;
export const TIMELINE_EXPORT_MAX_CSS_HEIGHT =
  TIMELINE_EXPORT_MAX_HEIGHT / TIMELINE_EXPORT_PIXEL_RATIO;
export const TIMELINE_EXPORT_MAX_ITEMS_PER_SECTION = 12;

export type TimelinePageRange = { end: number; start: number };

export function splitTimelineExportDays(
  days: PublicItineraryDay[],
  maxItems = TIMELINE_EXPORT_MAX_ITEMS_PER_SECTION,
) {
  return days.flatMap((day) => {
    if (day.items.length <= maxItems) return [day];
    const chunks: PublicItineraryDay[] = [];
    for (let start = 0; start < day.items.length; start += maxItems) {
      const index = chunks.length;
      chunks.push({
        ...day,
        items: day.items.slice(start, start + maxItems),
        notes: index === 0 ? day.notes : undefined,
        ref: `${day.ref}:export:${index}`,
      });
    }
    return chunks;
  });
}

export function paginateTimelineDayHeights({
  continuationChromeHeight,
  dayGap,
  dayHeights,
  firstPageChromeHeight,
  maxHeight = TIMELINE_EXPORT_MAX_CSS_HEIGHT,
}: {
  continuationChromeHeight: number;
  dayGap: number;
  dayHeights: number[];
  firstPageChromeHeight: number;
  maxHeight?: number;
}) {
  if (!dayHeights.length) return [{ end: 0, start: 0 }];
  const pages: TimelinePageRange[] = [];
  let start = 0;

  while (start < dayHeights.length) {
    const chromeHeight = pages.length ? continuationChromeHeight : firstPageChromeHeight;
    let contentHeight = chromeHeight;
    let end = start;
    while (end < dayHeights.length) {
      const nextHeight = dayHeights[end] + (end > start ? dayGap : 0);
      if (end > start && contentHeight + nextHeight > maxHeight) break;
      if (contentHeight + nextHeight > maxHeight)
        throw new Error("A Timeline day is too tall to export without clipping.");
      contentHeight += nextHeight;
      end += 1;
    }
    pages.push({ end, start });
    start = end;
  }

  return pages;
}
