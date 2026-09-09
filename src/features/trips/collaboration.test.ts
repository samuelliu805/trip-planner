import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("collaboration migration keeps one immutable creator-owner and member editing", async () => {
  const migration = await source(
    "database/shared/migrations/20260906020000_trip_collaboration_history_optimistic_lock.sql",
  );
  assert.match(migration, /RENAME VALUE 'editor' TO 'collaborator'/);
  assert.match(migration, /trip_members_one_owner_per_trip/);
  assert.match(migration, /Trip ownership cannot be transferred/);
  assert.match(migration, /CREATE POLICY trips_delete_owner[\s\S]*is_actual_trip_owner/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.is_trip_owner[\s\S]*can_edit_trip/);
  assert.match(migration, /REVOKE INSERT, UPDATE ON TABLE public\.trip_members FROM authenticated/);
});

test("invitations are registered-account only, region-specific, and enumeration safe", async () => {
  const [globalMigration, cnOverlay, action] = await Promise.all([
    source(
      "database/shared/migrations/20260906020000_trip_collaboration_history_optimistic_lock.sql",
    ),
    source(
      "database/cloudbase/overlays/migrations/20260906020000_trip_collaboration_history_optimistic_lock.sql",
    ),
    source("src/features/trips/collaboration-actions.ts"),
  ]);
  assert.match(globalMigration, /FROM auth\.users[\s\S]*lower\(email\)/);
  assert.match(cnOverlay, /auth\.users account[\s\S]*account\.username/);
  assert.match(cnOverlay, /\^1\[3-9\]\[0-9\]\{9\}\$/);
  assert.match(action, /If an account exists, access has been added/);
  assert.doesNotMatch(action, /user.not.found|not registered/i);
});

test("trip saves use atomic versions, idempotent history, and no conflict audit", async () => {
  const migration = await source(
    "database/shared/migrations/20260906020000_trip_collaboration_history_optimistic_lock.sql",
  );
  assert.match(migration, /version bigint NOT NULL DEFAULT 1/g);
  assert.match(migration, /WHERE id = target_trip_id AND version = expected_version/);
  assert.match(migration, /RAISE EXCEPTION 'Trip version conflict' USING errcode = '40001'/);
  assert.match(migration, /trip_history_operation_unique UNIQUE \(trip_id, operation_id\)/);
  assert.match(
    migration,
    /IF EXISTS \(SELECT 1 FROM public\.trip_history[\s\S]*RETURN target_trip_id/,
  );
  assert.ok(
    migration.indexOf("RAISE EXCEPTION 'Trip version conflict'") <
      migration.indexOf("append_trip_history(target_trip_id"),
  );
});

test("conflicts offer entity-local reload and roles/history remain discoverable", async () => {
  const [tripForm, itemForm, itemReload, card, menu] = await Promise.all([
    source("src/features/trips/components/trip-form.tsx"),
    source("src/features/itinerary/components/planner-item-form.tsx"),
    source("src/features/itinerary/components/use-planner-item-conflict-reload.ts"),
    source("src/features/trips/components/trip-card.tsx"),
    source("src/features/trips/components/trip-app-bar-menu.tsx"),
  ]);
  assert.match(tripForm, /Reload latest/);
  assert.match(tripForm, /api\/trips\/\$\{tripId\}\/settings/);
  assert.match(itemReload, /refetchQueries[\s\S]*currentDayItems[\s\S]*currentItem/);
  assert.match(itemForm, /setOrderPreviewItems\(latest\.items\)/);
  assert.doesNotMatch(itemForm, /Reapply my draft|Replace draft/);
  assert.match(card, /trip\.role === "owner" \? "Owner" : "Collaborator"/);
  assert.match(card, /trip\.role === "owner" \?[\s\S]{0,40}<DeleteTripDialog/);
  assert.match(card, /loadTripStatusSnapshot[\s\S]*Reload latest/);
  assert.match(card, /setPeopleOpen\(true\)[\s\S]*<TripPeopleEditor/);
  assert.match(menu, /historyHref/);
});

test("every destructive workspace conflict exposes a structured scope-local reload", async () => {
  const [
    plannerMutations,
    clipboard,
    plannerStatus,
    research,
    compare,
    plans,
    deleteAction,
    dialog,
  ] = await Promise.all([
    source("src/features/itinerary/hooks/use-planner-mutations.ts"),
    source("src/features/itinerary/hooks/use-planner-clipboard.ts"),
    source("src/features/itinerary/components/planner-layout-elements.tsx"),
    source("src/features/research/components/research-plan-actions.tsx"),
    source("src/features/research/components/compare-workspace.tsx"),
    source("src/features/variants/components/manage-route-variants-dialog.tsx"),
    source("src/features/trips/actions.ts"),
    source("src/features/trips/components/delete-trip-dialog.tsx"),
  ]);
  assert.match(plannerMutations, /isItineraryConflict\(error\)/);
  assert.match(clipboard, /isItineraryConflict\(error\)/);
  assert.doesNotMatch(plannerMutations + clipboard, /message\.includes|window\.location\.reload/);
  assert.match(plannerStatus, /interactionConflict[\s\S]*Reload latest/);
  assert.match(compare, /researchWorkspaceQueryKey[\s\S]*plannerQueryKey/);
  assert.match(research, /result\.code === "conflict"[\s\S]*Reload latest/);
  assert.match(plans, /isItineraryConflict\(caught\)[\s\S]*refetchRouteVariantList/);
  assert.match(deleteAction, /PlatformOperationError[\s\S]*error\.code === "conflict"/);
  assert.match(deleteAction, /return \{ conflict: true[\s\S]*\?error=delete/);
  assert.match(dialog, /loadTripDeleteSnapshot[\s\S]*state\.conflict[\s\S]*Reload latest/);
  assert.match(
    dialog,
    /if \(pending && !nextOpen\) return;[\s\S]*setReloadState\(openedTripDeleteSession\(state\)\)/,
  );
});

test("the forward migration fail-closes the complete installed Research function graph", async () => {
  const migration = await source(
    "database/shared/migrations/20260907110000_close_research_collaborator_authorization_postcondition.sql",
  );
  for (const prefix of [
    "apply_research_item_to_variant%",
    "revert_research_plan_application%",
    "select_research_item_for_variant%",
    "apply_selected_research_item%",
  ])
    assert.match(migration, new RegExp(prefix.replace("%", "%")));
  assert.match(migration, /current_user_id\|app_current_user_id/);
  assert.match(migration, /pg_get_functiondef/);
  assert.match(migration, /RESEARCH_COLLABORATOR_AUTHORIZATION_POSTCONDITION_FAILED/);
  assert.doesNotMatch(migration, /GRANT EXECUTE|REVOKE EXECUTE/);
});

test("the conflict boundary prevents deterministic PostgREST retries without widening ACLs", async () => {
  const migration = await source(
    "database/shared/migrations/20260907111000_expose_conflicts_without_postgrest_retry.sql",
  );
  assert.match(migration, /x-client-info[\s\S]*supabase[\s\S]*RAISE SQLSTATE 'PGRST'/);
  assert.match(migration, /RAISE EXCEPTION[\s\S]*errcode = '40001'/);
  assert.match(migration, /routine\.prokind = 'f'/);
  assert.match(migration, /POSTGREST_CONFLICT_ENVELOPE_POSTCONDITION_FAILED/);
  assert.match(
    migration,
    /REVOKE EXECUTE ON FUNCTION app_private\.raise_app_conflict\(text,text\)[\s\S]*PUBLIC, anon, authenticated/,
  );
  assert.doesNotMatch(migration, /GRANT EXECUTE/);
});

test("collaboration labels use provider account identities in history and the People editor", async () => {
  const [shared, globalOverlay, cnOverlay, peopleEditor, tripForm, menu, card] = await Promise.all([
    source("database/shared/migrations/20260908100000_account_identity_in_collaboration.sql"),
    source(
      "database/supabase/overlays/migrations/20260908100000_account_identity_in_collaboration.sql",
    ),
    source(
      "database/cloudbase/overlays/migrations/20260908100000_account_identity_in_collaboration.sql",
    ),
    source("src/features/trips/components/trip-people-editor.tsx"),
    source("src/features/trips/components/trip-form.tsx"),
    source("src/features/trips/components/trip-app-bar-menu.tsx"),
    source("src/features/trips/components/trip-card.tsx"),
  ]);
  assert.match(shared, /collaboration_user_label\(member\.user_id::text\)/);
  assert.match(shared, /collaboration_user_label\(app_private\.collaboration_user_id\(\)\)/);
  assert.match(globalOverlay, /account\.email/);
  assert.match(cnOverlay, /account\.username/);
  assert.match(globalOverlay + cnOverlay, /UPDATE public\.trip_history history/);
  assert.match(peopleEditor, /PlannerEditorScreen/);
  assert.match(menu, /onInviteTrip[\s\S]*<T message="Invite"/);
  assert.match(card, /<T message="Invite"[\s\S]*<TripPeopleEditor/);
  assert.doesNotMatch(tripForm, /TripPeople/);
});

test("itinerary reorder history stores readable item names and types", async () => {
  const migration = await source(
    "database/shared/migrations/20260908103000_readable_itinerary_order_history.sql",
  );
  assert.match(migration, /jsonb_build_object\('name',item\.title,'type',item\.type\)/);
  assert.match(
    migration,
    /jsonb_build_object\('order',jsonb_build_object\('before',previous_labels,'after',ordered_labels\)\)/,
  );
  assert.doesNotMatch(migration, /'before',previous_order,'after',ordered_item_ids/);
});

test("history filter options are bounded and Transport is excluded from order snapshots", async () => {
  const migration = await source(
    "database/shared/migrations/20260909034815_history_filters_and_activity_order.sql",
  );
  assert.match(
    migration,
    /lower\(coalesce\(normalized\.item ->> 'type', 'item'\)\) <> 'transport'/,
  );
  assert.match(migration, /CREATE FUNCTION public\.list_trip_history_filter_options_v1/);
  assert.match(migration, /public\.can_edit_trip\(target_trip_id\)/);
  assert.match(migration, /LIMIT 100/g);
  assert.match(migration, /REVOKE EXECUTE[\s\S]*FROM PUBLIC, anon/);
});

test("publishing keeps the source Plan version stable and refreshes aggregate trip versions", async () => {
  const [migration, dialog, form, editorScreen] = await Promise.all([
    source("database/shared/migrations/20260908101000_share_page_source_version_stability.sql"),
    source("src/features/sharing/components/public-share-dialog.tsx"),
    source("src/features/trips/components/trip-form.tsx"),
    source("src/features/itinerary/components/planner-editor-screen.tsx"),
  ]);
  assert.match(migration, /'variantVersion', variant_version/);
  assert.doesNotMatch(migration, /UPDATE public\.route_variants SET version/);
  assert.match(dialog, /router\.refresh\(\)/);
  assert.match(editorScreen, /\{open \? children : null\}/);
  assert.match(form, /useState\(true\)[\s\S]*loadLatestTripSettings\(trip\.id\)/);
  assert.match(form, /pending=\{pending \|\| refreshing\}/);
  assert.match(
    form,
    /trip\.version === currentTrip\.version[\s\S]*Math\.max\(trip\.content_version, currentTrip\.content_version\)/,
  );
});
