import type { ResearchItem, ResearchPlanSnapshot } from "../types";

export function choiceLabel(index: number) {
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

export function itemLabel(item: ResearchItem) {
  if (item.title) return item.title;
  if (item.origin_text && item.destination_text)
    return `${item.origin_text} → ${item.destination_text}${item.start_date ? ` · ${item.start_date}` : ""}`;
  if (item.source_url) {
    try {
      return new URL(item.source_url).hostname.replace(/^www\./, "");
    } catch {
      return item.source_url;
    }
  }
  return item.note || item.category;
}

export function activityNeedsDay(item: ResearchItem, plan: ResearchPlanSnapshot) {
  return item.category === "activity" && !plan.days.some((day) => day.date === item.start_date);
}
