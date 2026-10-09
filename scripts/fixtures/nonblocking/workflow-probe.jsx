import React from "react";
import { AddIdeaToPlan } from "../../../src/features/research/components/add-idea-to-plan";
import { IdeaComparisons } from "../../../src/features/research/components/idea-comparisons";
import { ResearchPlanActions } from "../../../src/features/research/components/research-plan-actions";
import { useBackgroundActions } from "../../../src/features/editing/use-background-actions";
export const researchFixture = (workspace, suffix = "71") => ({
  id: `00000000-0000-4000-8000-0000000000${suffix}`,
  trip_id: workspace.variant.trip_id,
  category: "activity",
  title: `Idea ${suffix}`,
  version: 1,
  attachments: [],
  links: [],
  segments: [],
  journey_type: null,
  source_url: null,
  note: null,
  start_date: null,
  end_date: null,
  start_time: null,
  end_time: null,
  itinerary_item_id: null,
  price_amount: null,
  currency: "USD",
  created_at: "2026-10-09T00:00:00Z",
  origin_text: null,
  destination_text: null,
  location_text: null,
});
export const planFixture = (workspace) => ({
  variantId: workspace.variant.id,
  variantName: workspace.variant.name,
  variant: workspace.variant,
  days: workspace.days.map((day) => ({
    id: day.id,
    dayNumber: day.day_number,
    date: day.date,
    items: day.items,
  })),
});
export function WorkflowProbe({ workspace }) {
  const owner = useBackgroundActions(workspace.variant.trip_id, "idea-workflows");
  const plan = planFixture(workspace),
    items = [researchFixture(workspace), researchFixture(workspace, "72")];
  const [application, setApplication] = React.useState();
  React.useEffect(() => {
    window.__workflows = owner;
  }, [owner]);
  return (
    <section data-workflow-probe>
      <AddIdeaToPlan item={items[0]} plan={plan} />
      <IdeaComparisons
        defaultCurrency="USD"
        items={items}
        onSaved={() => {}}
        onSortChange={() => {}}
        plan={plan}
        sort="recent"
        tripId={workspace.variant.trip_id}
      />
      <ResearchPlanActions
        item={{
          ...items[1],
          category: "flight",
          start_date: plan.days[0].date,
          end_date: plan.days[0].date,
          origin_text: "A",
          destination_text: "B",
        }}
        plan={plan}
        variantName={plan.variantName}
        application={application}
        onApplied={setApplication}
        onReverted={() => setApplication(undefined)}
        onSelected={() => {}}
        onReloadLatest={async () => {}}
      />
      <button onClick={() => owner?.queue.retry(owner.queue.operations[0]?.id)}>
        Retry workflow
      </button>
    </section>
  );
}
