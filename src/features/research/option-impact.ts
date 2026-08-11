import type { OptionImpact, ResearchItem, ResearchPlanDay, ResearchPlanSnapshot } from "./types.ts";

const dayMs = 86_400_000;

function distance(start: string, end: string) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / dayMs);
}

function result(
  values: Partial<OptionImpact> & Pick<OptionImpact, "code" | "label" | "message">,
): OptionImpact {
  return {
    affectedDayCount: 1,
    dayDelta: 0,
    operation: "add",
    planAction: "apply",
    ...values,
  };
}

function itemTarget(item: ResearchItem, plan: ResearchPlanSnapshot) {
  if (!item.itinerary_item_id) return undefined;
  return plan.days
    .flatMap((day) => day.items.map((entry) => ({ day, entry })))
    .find(({ entry }) => entry.id === item.itinerary_item_id);
}

function datedDays(plan: ResearchPlanSnapshot) {
  return plan.days.filter((day): day is ResearchPlanDay & { date: string } => Boolean(day.date));
}

export function deriveOptionImpact(item: ResearchItem, plan: ResearchPlanSnapshot): OptionImpact {
  const target = itemTarget(item, plan);
  if (item.itinerary_item_id && !target)
    return result({
      code: "manual_review",
      label: "Choose where to apply",
      message: "The original Plan item no longer exists. Choose another matching item.",
      planAction: "manual_review",
    });
  const days = datedDays(plan);
  if (!days.length || days.length !== plan.days.length)
    return result({
      code: "manual_review",
      label: "Dates will be added",
      message: "Apply will date the existing Plan days from this option.",
    });
  if (!item.start_date)
    return result({
      code: "manual_review",
      label: "Add dates first",
      message: "This option needs dates before it can be placed in the Plan.",
      planAction: "manual_review",
    });

  const planStart = days[0].date;
  const planEnd = days.at(-1)!.date;
  const operation = target ? "replace" : "add";
  const currentTitle = target?.entry.title;

  if (item.category === "flight") {
    const flightEnd = item.end_date ?? item.start_date;
    if (item.start_date === planStart && flightEnd === planEnd)
      return result({
        affectedDayCount: item.end_date ? 2 : 1,
        code: "exact_fit",
        currentTitle,
        label: target ? "Replace planned flight" : "Add flight to Plan",
        message: "Apply will add or update the flight. Plan dates already match.",
        operation,
      });
    const planLength = distance(planStart, planEnd);
    const flightLength = distance(item.start_date, flightEnd);
    if (planLength === flightLength)
      return result({
        affectedDayCount: plan.days.length,
        code: "date_shift_same_duration",
        currentTitle,
        label: "Move Plan to the flight dates",
        message: `Apply will move the Plan from ${planStart}–${planEnd} to ${item.start_date}–${flightEnd}, preserving Day and Activity identities.`,
        operation,
      });
    const dayDelta = flightLength - planLength;
    if (dayDelta > 0)
      return result({
        affectedDayCount: plan.days.length + dayDelta,
        code: "structural_change",
        currentTitle,
        dayDelta,
        label: `Add ${dayDelta} ${dayDelta === 1 ? "day" : "days"} and apply flight`,
        message: "Apply will preserve existing Days, add the missing dates, and update the flight.",
        operation,
        planAction: "extend_plan",
      });
    return result({
      affectedDayCount: Math.max(1, plan.days.length + dayDelta),
      code: "structural_change",
      currentTitle,
      dayDelta,
      label: `Flight is ${Math.abs(dayDelta)} ${Math.abs(dayDelta) === 1 ? "day" : "days"} shorter`,
      message:
        "Empty extra Days will be removed automatically. If they contain plans, choose whether to keep them after the flight.",
      operation,
      planAction: "remove_days_first",
    });
  }

  const candidateEnd =
    item.category === "stay" && item.end_date
      ? new Date(Date.parse(`${item.end_date}T00:00:00Z`) - dayMs).toISOString().slice(0, 10)
      : (item.end_date ?? item.start_date);
  const before = item.start_date < planStart ? distance(item.start_date, planStart) : 0;
  const after = candidateEnd > planEnd ? distance(planEnd, candidateEnd) : 0;
  const addedDays = before + after;
  const label = item.category === "stay" ? "stay" : item.category === "rental" ? "rental" : "train";
  return result({
    affectedDayCount:
      item.category === "stay" && item.end_date
        ? distance(item.start_date, item.end_date)
        : item.category === "rental"
          ? 2
          : 1,
    code: addedDays ? "structural_change" : "exact_fit",
    currentTitle,
    dayDelta: addedDays,
    label: `${target ? "Update" : "Add"} ${label} in Plan`,
    message: addedDays
      ? `Apply will add ${addedDays} missing Plan ${addedDays === 1 ? "day" : "days"}, then add or update the ${label}.`
      : `Apply will add or update the ${label} on the matching Plan dates.`,
    operation,
    planAction: addedDays ? "extend_plan" : "apply",
  });
}
