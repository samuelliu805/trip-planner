import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { I18nProvider } from "../../../src/features/i18n/i18n-provider";
import { DraftScopeProvider } from "../../../src/features/editing/draft-scope";
import {
  PlannerOutboxProvider,
  usePlannerOutbox,
} from "../../../src/features/itinerary/planner-outbox-provider";
import { PlannerItemEditorDialog } from "../../../src/features/itinerary/components/planner-item-editor-dialog";
import { PlannerItemRow } from "../../../src/features/itinerary/components/planner-item-row";
import { PlannerSyncStatus } from "../../../src/features/itinerary/components/planner-sync-status";
import { PlannerCellContextMenu } from "../../../src/features/itinerary/components/planner-cell-context-menu";
import { ArrangeActivitiesSheet } from "../../../src/features/itinerary/components/arrange-activities-sheet";
import { QuickIdeaInput } from "../../../src/features/research/components/quick-idea-input";
import { ContextMenu, ContextMenuTrigger } from "../../../src/components/ui/context-menu";
import { orderedMatrixItems } from "../../../src/features/itinerary/activity-order";
import { plannerQueryKey } from "../../../src/features/itinerary/planner-query";
import {
  useReorderItineraryItems,
  useInsertTripDay,
  useCopyItineraryItems,
  useRemoveTripDay,
} from "../../../src/features/itinerary/day-mutations";
import {
  PlannerEditorDock,
  PlannerEditorDockTarget,
} from "../../../src/features/itinerary/components/planner-editor-dock";
import { useResearchSync } from "../../../src/features/research/use-research-sync";
import { TripForm } from "../../../src/features/trips/components/trip-form";
import { updateTripSchema } from "../../../src/features/trips/schema";
import { TripSettingsEditor } from "../../../src/features/trips/components/trip-settings-editor";
import { RouteProbe } from "./route-probe";
import { BackgroundProbe } from "./background-probe";
import { VariantProbe } from "./variant-probe";
import { WorkflowProbe } from "./workflow-probe";
import { TripListProbe } from "./trip-list-probe";
import { AttachmentProbe } from "./attachment-probe";
import { PlaceProbe } from "./place-probe";
import { CrossPlanCopyProbe } from "./cross-plan-copy-probe";

const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
});
const initial = window.__initial;
window.__settingsInputValid = (input) => updateTripSchema.safeParse(input).success;
client.setQueryData(plannerQueryKey(initial.variant.trip_id, initial.variant.id), initial);
window.__client = client;
function EditorFixture() {
  const runtime = usePlannerOutbox();
  const ideas = useResearchSync(initial.variant.trip_id);
  const { data: workspace } = useQuery({
    queryKey: plannerQueryKey(initial.variant.trip_id, initial.variant.id),
    enabled: false,
  });
  const [editor, setEditor] = React.useState(null);
  const [arranging, setArranging] = React.useState(false);
  const [error, setError] = React.useState("");
  const reorder = useReorderItineraryItems(initial.variant.trip_id, initial.variant.id);
  const insert = useInsertTripDay(initial.variant.trip_id, initial.variant.id);
  const copy = useCopyItineraryItems(initial.variant.trip_id, initial.variant.id);
  const removeDay = useRemoveTripDay(initial.variant.trip_id, initial.variant.id);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [routes, setRoutes] = React.useState(false);
  const [plans, setPlans] = React.useState(false);
  const [workflows, setWorkflows] = React.useState(false);
  const [tripList, setTripList] = React.useState(false);
  const [files, setFiles] = React.useState(false);
  const [places, setPlaces] = React.useState(false);
  const day = workspace.days[0];
  React.useEffect(() => {
    window.__runtime = runtime;
    window.__ideas = ideas;
    window.__workspace = workspace;
  }, [runtime, workspace, ideas]);
  return (
    <div className="grid min-[1200px]:grid-cols-[minmax(0,1fr)_400px]" style={{ height: "100%" }}>
      <div>
        {window.__otherWorkspace ? (
          <PlannerOutboxProvider workspace={window.__otherWorkspace}>
            <CrossPlanCopyProbe source={workspace} target={window.__otherWorkspace} />
          </PlannerOutboxProvider>
        ) : null}
        <PlannerSyncStatus mutating={false} />
        <button onClick={() => setPlaces((value) => !value)}>Toggle place search</button>
        {places ? <PlaceProbe tripId={initial.variant.trip_id} /> : null}
        <button onClick={() => setFiles((value) => !value)}>Toggle attachment viewer</button>
        {files ? <AttachmentProbe workspace={workspace} /> : null}
        <button onClick={() => setWorkflows((value) => !value)}>Toggle workflows</button>
        {workflows ? <WorkflowProbe workspace={workspace} /> : null}
        <button onClick={() => setTripList((value) => !value)}>Toggle trip list</button>
        {tripList ? <TripListProbe workspace={workspace} /> : null}
        <button onClick={() => setRoutes((value) => !value)}>Toggle routes fixture</button>
        <BackgroundProbe workspace={workspace} />
        {routes ? <RouteProbe workspace={workspace} /> : null}
        <button onClick={() => setPlans((value) => !value)}>Toggle Plans fixture</button>
        {plans ? <VariantProbe workspace={workspace} /> : null}
        <button onClick={() => setSettingsOpen(true)}>Trip settings</button>
        <TripSettingsEditor
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          title="Trip settings"
        >
          <TripForm trip={window.__trip} />
        </TripSettingsEditor>
        <button
          onClick={() =>
            insert.mutate({
              tripId: initial.variant.trip_id,
              variantId: initial.variant.id,
              beforeDayNumber: 2,
              expectedDaysVersion: workspace.variant.days_version,
              operationId: crypto.randomUUID(),
            })
          }
        >
          Insert day
        </button>
        <button
          onClick={() => {
            const day = workspace.days[1];
            removeDay.mutate({
              tripId: initial.variant.trip_id,
              variantId: initial.variant.id,
              dayId: day.id,
              expectedDaysVersion: workspace.variant.days_version,
              expectedVersion: day.version,
              expectedContentVersion: day.content_version,
              operationId: crypto.randomUUID(),
            });
          }}
        >
          Delete second day
        </button>
        <button
          onClick={() =>
            copy.mutate({
              tripId: initial.variant.trip_id,
              variantId: initial.variant.id,
              targetDayId: workspace.days.at(-1).id,
              sourceItemIds: [day.items[0].id],
              sourceVersions: [day.items[0].version],
              expectedItemsVersion: workspace.days.at(-1).items_version,
              operationId: crypto.randomUUID(),
            })
          }
        >
          Copy first to last
        </button>
        <button
          onClick={() => {
            const source = day.items.find((item) => item.details?.ideaResearchItemId);
            if (!source) return;
            copy.mutate({
              tripId: initial.variant.trip_id,
              variantId: initial.variant.id,
              targetDayId: workspace.days.at(-1).id,
              sourceItemIds: [source.id],
              sourceVersions: [source.version],
              expectedItemsVersion: workspace.days.at(-1).items_version,
              operationId: crypto.randomUUID(),
            });
          }}
        >
          Copy pending Idea to last
        </button>
        <button onClick={() => setEditor({ dayId: day.id, type: "meal" })}>New meal</button>
        <button
          onClick={() => setEditor({ dayId: day.id, type: day.items[0].type, item: day.items[0] })}
        >
          Edit first
        </button>
        <button
          onClick={() =>
            setEditor({
              dayId: workspace.days[1].id,
              type: "activity",
              item: workspace.days[1].items[0],
            })
          }
        >
          Edit other day
        </button>
        <p role="alert">{error}</p>
        {workspace.variant.name === "NZ ordering regression" ? (
          <div data-flight-rows>
            {orderedMatrixItems(day.items)
              .filter((item) => item.type === "flight")
              .map((item) => (
                <PlannerItemRow
                  key={item.id}
                  item={item}
                  interactive={false}
                  selected={false}
                  onCopy={() => {}}
                  onDelete={() => {}}
                  onEdit={() => {}}
                  onSelect={() => {}}
                />
              ))}
          </div>
        ) : null}
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div data-test-cell tabIndex={0}>
              {orderedMatrixItems(day.items).map((item) => (
                <button
                  data-test-item={item.id}
                  key={item.id}
                  onClick={() => setEditor({ dayId: day.id, type: item.type, item })}
                >
                  {item.title}
                </button>
              ))}
            </div>
          </ContextMenuTrigger>
          <PlannerCellContextMenu
            canReorder
            onReorder={() => setArranging(true)}
            dayMutationPending={false}
            hasItems
            isOnlyDay={false}
            insertDayAfter={() => {}}
            insertDayBefore={() => {}}
            onCopyCell={() => {}}
            onCopyItem={() => {}}
            onDeleteCell={() => {}}
            onDeleteDay={() => {}}
            onDeleteItem={() => {}}
            onEditItem={() => {}}
            onPaste={() => {}}
          />
        </ContextMenu>
      </div>
      <div className="hidden min-h-0 min-[1200px]:block">
        <PlannerEditorDockTarget>
          <div data-fixture-map style={{ height: "100%" }}>
            Map fixture
          </div>
        </PlannerEditorDockTarget>
      </div>
      <PlannerItemEditorDialog
        editor={editor}
        defaultCurrency="USD"
        dayDate={day.date}
        dayItems={day.items}
        onClose={() => setEditor(null)}
        onDraftChange={(draft) => {
          window.__editorDraft = draft;
        }}
        onError={setError}
        onSaveFeedback={() => {}}
        shareAttachmentsEnabled={false}
        tripId={initial.variant.trip_id}
        variantId={initial.variant.id}
        unavailableTransportModes={[]}
      />
      <ArrangeActivitiesSheet
        day={day}
        open={arranging}
        onOpenChange={setArranging}
        pending={false}
        conflict={false}
        reloadPending={false}
        onReloadLatest={async () => {}}
        onCommit={async (target, ids) => {
          await reorder.mutateAsync({
            dayId: target.id,
            expectedItemsVersion: target.items_version,
            operationId: crypto.randomUUID(),
            tripId: initial.variant.trip_id,
            variantId: initial.variant.id,
            items: ids.map((id, sortOrder) => ({ id, sortOrder })),
          });
          return true;
        }}
      />
      <QuickIdeaInput
        items={[]}
        tripId={initial.variant.trip_id}
        onSaved={(value) => {
          window.__quickSaved = value;
        }}
      />
    </div>
  );
}
function OwnedEditorFixture() {
  const [generation, setGeneration] = React.useState(0);
  return (
    <>
      <button onClick={() => setGeneration((value) => value + 1)}>
        Reopen source workspace fixture
      </button>
      <PlannerOutboxProvider
        key={generation}
        workspace={client.getQueryData(
          plannerQueryKey(initial.variant.trip_id, initial.variant.id),
        )}
      >
        <div style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
          <PlannerEditorDock>
            <EditorFixture />
          </PlannerEditorDock>
        </div>
      </PlannerOutboxProvider>
    </>
  );
}
createRoot(document.getElementById("fixture")).render(
  <QueryClientProvider client={client}>
    <I18nProvider initialLocale="en">
      <DraftScopeProvider actorId={window.__actor ?? "e2e-account-A"}>
        {location.pathname === "/background" ? (
          <>
            <p>Background view</p>
            <PlannerSyncStatus tripId={initial.variant.trip_id} mutating={false} />
          </>
        ) : (
          <OwnedEditorFixture />
        )}
      </DraftScopeProvider>
    </I18nProvider>
  </QueryClientProvider>,
);
