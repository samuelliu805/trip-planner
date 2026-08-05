import type {
  DecisionSummaryDayRow,
  DecisionSummaryItemRow,
  HotelDifference,
  HotelDifferenceEntry,
  HotelOccurrence,
  VariantDecisionSummaryProjection,
} from "./decision-summary-types.ts";

function hotelOccurrence(item: DecisionSummaryItemRow, day: DecisionSummaryDayRow) {
  const normalizedTitle = item.title.trim().toLowerCase();
  return {
    date: day.date,
    dayNumber: day.day_number,
    identity: item.place_id ? `place:${item.place_id}` : `title:${normalizedTitle}`,
    itemId: item.id,
    placeId: item.place_id,
    title: item.title,
  } satisfies HotelOccurrence;
}

export function deriveHotelOccurrences(
  items: DecisionSummaryItemRow[],
  days: DecisionSummaryDayRow[],
) {
  const dayById = new Map(days.map((day) => [day.id, day]));
  return items
    .filter(({ type }) => type === "hotel")
    .flatMap((item) => {
      const day = dayById.get(item.day_id);
      return day ? [hotelOccurrence(item, day)] : [];
    })
    .sort(
      (a, b) =>
        a.dayNumber - b.dayNumber ||
        a.identity.localeCompare(b.identity) ||
        a.itemId.localeCompare(b.itemId),
    );
}

function alignmentKey(occurrence: HotelOccurrence, counterpartDays: Map<number, string | null>) {
  const counterpartDate = counterpartDays.get(occurrence.dayNumber);
  return occurrence.date && counterpartDate
    ? `date:${occurrence.date}`
    : `day:${occurrence.dayNumber}`;
}

function alignmentLabel(key: string) {
  return key.startsWith("date:") ? key.slice(5) : `Day ${key.slice(4)}`;
}

function groupedHotelOccurrences(
  occurrences: HotelOccurrence[],
  counterpartDays: Map<number, string | null>,
) {
  const groups = new Map<string, HotelOccurrence[]>();
  for (const occurrence of occurrences) {
    const key = alignmentKey(occurrence, counterpartDays);
    groups.set(key, [...(groups.get(key) ?? []), occurrence]);
  }
  return groups;
}

function orderedAlignmentKeys(
  primaryGroups: Map<string, HotelOccurrence[]>,
  comparedGroups: Map<string, HotelOccurrence[]>,
) {
  return [...new Set([...primaryGroups.keys(), ...comparedGroups.keys()])].sort((a, b) => {
    const occurrencesFor = (key: string) => [
      ...(primaryGroups.get(key) ?? []),
      ...(comparedGroups.get(key) ?? []),
    ];
    const firstDay = (key: string) =>
      occurrencesFor(key).reduce(
        (minimum, occurrence) => Math.min(minimum, occurrence.dayNumber),
        Number.POSITIVE_INFINITY,
      );
    return firstDay(a) - firstDay(b) || a.localeCompare(b);
  });
}

function compareHotelGroup(
  key: string,
  primaryOccurrences: HotelOccurrence[],
  comparedOccurrences: HotelOccurrence[],
) {
  const entries: HotelDifferenceEntry[] = [];
  const primaryRemaining = [...primaryOccurrences];
  const comparedRemaining = [...comparedOccurrences];
  for (let index = comparedRemaining.length - 1; index >= 0; index -= 1) {
    const occurrence = comparedRemaining[index];
    const primaryIndex = primaryRemaining.findIndex(
      ({ identity }) => identity === occurrence.identity,
    );
    if (primaryIndex < 0) continue;
    entries.push({
      alignmentLabel: alignmentLabel(key),
      compared: occurrence,
      primary: primaryRemaining[primaryIndex],
      status: "same",
    });
    comparedRemaining.splice(index, 1);
    primaryRemaining.splice(primaryIndex, 1);
  }
  while (primaryRemaining.length && comparedRemaining.length) {
    entries.push({
      alignmentLabel: alignmentLabel(key),
      compared: comparedRemaining.shift(),
      primary: primaryRemaining.shift(),
      status: "changed",
    });
  }
  for (const occurrence of comparedRemaining)
    entries.push({
      alignmentLabel: alignmentLabel(key),
      compared: occurrence,
      status: "added",
    });
  for (const occurrence of primaryRemaining)
    entries.push({
      alignmentLabel: alignmentLabel(key),
      primary: occurrence,
      status: "removed",
    });
  return entries;
}

export function compareHotelOccurrences(
  primary: VariantDecisionSummaryProjection,
  compared: VariantDecisionSummaryProjection,
): HotelDifference {
  const primaryDays = new Map(primary.dayDates.map(({ date, dayNumber }) => [dayNumber, date]));
  const comparedDays = new Map(compared.dayDates.map(({ date, dayNumber }) => [dayNumber, date]));
  const primaryGroups = groupedHotelOccurrences(primary.hotelOccurrences, comparedDays);
  const comparedGroups = groupedHotelOccurrences(compared.hotelOccurrences, primaryDays);
  const entries = orderedAlignmentKeys(primaryGroups, comparedGroups).flatMap((key) =>
    compareHotelGroup(key, primaryGroups.get(key) ?? [], comparedGroups.get(key) ?? []),
  );
  const count = (status: HotelDifferenceEntry["status"]) =>
    entries.filter((entry) => entry.status === status).length;
  return {
    added: count("added"),
    affectedLabels: [
      ...new Set(
        entries
          .filter(({ status }) => status !== "same")
          .map(({ alignmentLabel }) => alignmentLabel),
      ),
    ],
    changed: count("changed"),
    entries,
    removed: count("removed"),
    same: count("same"),
  };
}
