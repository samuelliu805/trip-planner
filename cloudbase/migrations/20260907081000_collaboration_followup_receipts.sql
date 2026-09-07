-- Generated CloudBase migration from database/shared/migrations/20260907081000_collaboration_followup_receipts.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

CREATE TABLE public.trip_deletion_receipts (
  operation_id uuid PRIMARY KEY,
  actor_user_id text NOT NULL,
  trip_id uuid NOT NULL,
  payload_fingerprint text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE public.trip_deletion_receipts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.delete_trip_v2(
  target_trip_id uuid, expected_version bigint, target_operation_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actual_version bigint;
  receipt public.trip_deletion_receipts%ROWTYPE;
  actor text := app_private.collaboration_user_id();
  fingerprint text;
BEGIN
  IF actor IS NULL OR target_operation_id IS NULL THEN
    RAISE EXCEPTION 'OPERATION_ID_REQUIRED' USING errcode = '22023';
  END IF;
  fingerprint := app_private.operation_fingerprint(
    'trip.delete', 'trip', target_trip_id,
    jsonb_build_object('expectedVersion', expected_version));
  SELECT * INTO receipt FROM public.trip_deletion_receipts
  WHERE operation_id = target_operation_id FOR UPDATE;
  IF FOUND THEN
    IF receipt.actor_user_id IS DISTINCT FROM actor
      OR receipt.trip_id IS DISTINCT FROM target_trip_id
      OR receipt.payload_fingerprint IS DISTINCT FROM fingerprint
    THEN RAISE EXCEPTION 'OPERATION_ID_REUSED' USING errcode = '22023'; END IF;
    RETURN true;
  END IF;
  IF NOT public.is_actual_trip_owner(target_trip_id) THEN
    RAISE EXCEPTION 'TRIP_OWNER_REQUIRED' USING errcode = '42501';
  END IF;
  SELECT version INTO actual_version FROM public.trips
  WHERE id = target_trip_id FOR UPDATE;
  IF actual_version IS DISTINCT FROM expected_version THEN
    RAISE EXCEPTION 'APP_CONFLICT' USING errcode = '40001';
  END IF;
  INSERT INTO public.trip_deletion_receipts(
    operation_id, actor_user_id, trip_id, payload_fingerprint
  ) VALUES (target_operation_id, actor, target_trip_id, fingerprint);
  DELETE FROM public.trips WHERE id = target_trip_id AND version = expected_version;
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_trip_v2(uuid,bigint,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_trip_v2(uuid,bigint,uuid) TO authenticated;

-- 0800 used a legacy schedule label in an otherwise valid function body. Rebuild
-- that exact deployed definition forward-only with the canonical enum label.
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.save_itinerary_item_v2(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid[],bigint,bigint,uuid)'::regprocedure)
  INTO definition;
  EXECUTE replace(definition, '''untimed''', '''none''');
END;
$$;

ALTER FUNCTION app_private.safe_jsonb_diff(jsonb,jsonb,text) STABLE;
ALTER FUNCTION public.current_research_plan_application_ids(uuid,uuid) VOLATILE;

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION public.delete_trip_v2(uuid,bigint,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_trip_v2(uuid,bigint,uuid) TO authenticated;

COMMIT;
