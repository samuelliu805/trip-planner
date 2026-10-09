import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVariantSync } from "../../../src/features/variants/use-variant-sync";
import { variantListQueryKey } from "../../../src/features/variants/variant-list-reload";
import { RouteVariantEditorDialog } from "../../../src/features/variants/components/route-variant-editor-dialog";
import { ownedPlannerRuntime } from "../../../src/features/itinerary/planner-runtime-owner";
import { plannerQueryKey } from "../../../src/features/itinerary/planner-query";
import { useLocalPlanNavigation } from "../../../src/features/variants/use-local-plan-navigation";
import { RouteVariantControls } from "../../../src/features/variants/components/route-variant-controls";

export function VariantProbe({ workspace }) {
  const tripId = workspace.variant.trip_id;
  const runtime = useVariantSync(tripId, window.__initialVariants);
  const client = useQueryClient();
  const navigation = useLocalPlanNavigation(workspace, window.__initialVariants);
  const { data: variants } = useQuery({
    queryKey: variantListQueryKey(tripId),
    initialData: window.__initialVariants,
    enabled: false,
  });
  const [editor, setEditor] = React.useState(null),
    [error, setError] = React.useState("");
  const newest = variants.at(-1);
  React.useEffect(() => {
    window.__variants = runtime;
  }, [runtime]);
  const accept = (kind, input) => {
    try {
      runtime.accept({ kind, input });
    } catch (error) {
      setError(String(error));
    }
  };
  return (
    <section aria-label="Plan fixture controls">
      <RouteVariantControls
        activeVariantId={navigation.workspace.variant.id}
        title="Navigation fixture"
        tripId={tripId}
        variants={variants}
        onNavigate={navigation.navigate}
      />
      <output data-active-plan>{navigation.workspace.variant.id}</output>
      <button onClick={() => setEditor({ mode: "blank", variant: variants[0] })}>
        New Plan fixture
      </button>
      <button onClick={() => setEditor({ mode: "duplicate", variant: variants[0] })}>
        Copy Plan fixture
      </button>
      <button onClick={() => setEditor({ mode: "metadata", variant: variants[0] })}>
        Edit first Plan fixture
      </button>
      <button onClick={() => setEditor({ mode: "metadata", variant: newest })}>
        Edit newest Plan fixture
      </button>
      <button
        onClick={() =>
          accept("primary", {
            tripId,
            variantId: newest.id,
            expectedVersion: newest.version,
            operationId: crypto.randomUUID(),
          })
        }
      >
        Primary newest fixture
      </button>
      <button
        onClick={() =>
          accept("delete", {
            tripId,
            variantId: newest.id,
            expectedVersion: newest.version,
            expectedContentVersion: newest.content_version,
            expectedDaysVersion: newest.days_version,
            expectedItemsVersion: newest.items_version,
            operationId: crypto.randomUUID(),
          })
        }
      >
        Delete newest fixture confirmation
      </button>
      <button
        onClick={() => {
          const newest = runtime.project().at(-1);
          const pending = client.getQueryData(plannerQueryKey(tripId, newest.id));
          const owner = ownedPlannerRuntime(
            ["global", "e2e-account-A", tripId, newest.id],
            client,
            pending,
          );
          window.__newPlanItems = owner;
          owner.accept({
            kind: "create",
            input: {
              tripId,
              variantId: newest.id,
              dayId: pending.days[0].id,
              type: "activity",
              details: {},
              title: "Immediate child",
              expectedItemsVersion: pending.days[0].items_version,
              operationId: crypto.randomUUID(),
            },
          });
        }}
      >
        Add immediate child fixture
      </button>
      <output data-plan-list>{variants.map((row) => row.name).join("|")}</output>
      <p role="alert">{error}</p>
      {editor ? (
        <RouteVariantEditorDialog
          key={editor.mode + editor.variant.id}
          mode={editor.mode}
          activeVariant={editor.variant}
          variants={variants}
          tripId={tripId}
          open
          onOpenChange={(open) => !open && setEditor(null)}
        />
      ) : null}
    </section>
  );
}
