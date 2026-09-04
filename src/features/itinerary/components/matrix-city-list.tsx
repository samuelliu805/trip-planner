import { MatrixItemSummary } from "@/features/itinerary/components/matrix-presentation";

export function MatrixCityList({
  labels,
  publicView = false,
}: {
  labels: string[];
  publicView?: boolean;
}) {
  const rows = labels.length ? labels : ["-"];

  return rows.map((title, index) => (
    <div
      className={`matrix-city-summary flex min-w-0 flex-col justify-center px-1.5 py-1 ${
        publicView ? "min-h-11 min-[1200px]:min-h-8" : "min-h-8 rounded"
      }`}
      data-city-summary=""
      key={`${index}:${title}`}
    >
      <MatrixItemSummary title={title} type="location" />
    </div>
  ));
}
