export type MarkerDateEntry = { dayLabel: string; dayNumber: number };

function rangeLabel(start: MarkerDateEntry, end: MarkerDateEntry) {
  if (start.dayNumber === end.dayNumber) return start.dayLabel;
  const startPrefix = start.dayLabel.slice(0, start.dayLabel.lastIndexOf(" "));
  const endPrefix = end.dayLabel.slice(0, end.dayLabel.lastIndexOf(" "));
  const endValue = end.dayLabel.slice(end.dayLabel.lastIndexOf(" ") + 1);
  return startPrefix && startPrefix === endPrefix
    ? `${start.dayLabel}–${endValue}`
    : `${start.dayLabel}–${end.dayLabel}`;
}

export function mergeMarkerDateRanges(entries: MarkerDateEntry[]) {
  const days = [...new Map(entries.map((entry) => [entry.dayNumber, entry])).values()].sort(
    (a, b) => a.dayNumber - b.dayNumber,
  );
  if (!days.length) return "";
  const labels: string[] = [];
  let start = days[0];
  let end = days[0];
  for (const day of days.slice(1)) {
    if (day.dayNumber === end.dayNumber + 1) {
      end = day;
      continue;
    }
    labels.push(rangeLabel(start, end));
    start = day;
    end = day;
  }
  labels.push(rangeLabel(start, end));
  return labels.join(", ");
}
