BEGIN;

CREATE TABLE public.trip_creation_receipts(
  actor_user_id text NOT NULL,
  operation_id uuid NOT NULL,
  payload_fingerprint text NOT NULL,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_user_id,operation_id)
);
ALTER TABLE public.trip_creation_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_creation_receipts FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.create_trip_v3(
  trip_title text,trip_timezone text,trip_currency text,trip_locale text,
  trip_day_count integer,trip_start_date date,trip_end_date date,target_operation_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor text:=app_private.collaboration_user_id(); fingerprint text;
  receipt public.trip_creation_receipts%ROWTYPE; created_id uuid; operation_state jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING errcode='42501'; END IF;
  fingerprint:=md5(jsonb_build_object('title',trip_title,'timezone',trip_timezone,
    'currency',trip_currency,'locale',trip_locale,'dayCount',trip_day_count,
    'startDate',trip_start_date,'endDate',trip_end_date)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(actor||target_operation_id::text,890));
  SELECT * INTO receipt FROM public.trip_creation_receipts
    WHERE actor_user_id=actor AND operation_id=target_operation_id;
  IF FOUND THEN
    IF receipt.payload_fingerprint<>fingerprint THEN RAISE EXCEPTION 'APP_OPERATION_MISMATCH'
      USING errcode='22023'; END IF;
    RETURN receipt.trip_id;
  END IF;
  created_id:=public.create_trip_v2(trip_title=>trip_title,trip_start_date=>trip_start_date,
    trip_end_date=>trip_end_date,trip_timezone=>trip_timezone,trip_currency=>trip_currency,
    trip_day_count=>trip_day_count,trip_locale=>trip_locale);
  INSERT INTO public.trip_creation_receipts(actor_user_id,operation_id,payload_fingerprint,trip_id)
    VALUES(actor,target_operation_id,fingerprint,created_id);
  operation_state:=app_private.begin_trip_operation(created_id,target_operation_id,
    'trip.create','trip',created_id,jsonb_build_object('fingerprint',fingerprint));
  PERFORM app_private.append_trip_history_v2(created_id,target_operation_id,'trip.create','trip',
    created_id,'trip.created',jsonb_build_object('trip',jsonb_build_object('before',NULL,
      'after',jsonb_build_object('id',created_id,'title',trip_title,'timezone',trip_timezone,
        'currency',trip_currency,'dayCount',trip_day_count))));
  PERFORM app_private.complete_trip_operation(created_id,target_operation_id,
    jsonb_build_object('id',created_id,'version',1));
  RETURN created_id;
END $$;

CREATE FUNCTION public.rename_trip_if_title_v2(
  target_trip_id uuid,current_title text,next_title text,expected_version bigint,
  target_operation_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operation_state jsonb; trip public.trips%ROWTYPE; result jsonb;
BEGIN
  operation_state:=app_private.begin_trip_operation(target_trip_id,target_operation_id,
    'trip.auto_title','trip',target_trip_id,jsonb_build_object('currentTitle',current_title,
      'nextTitle',next_title,'expectedVersion',expected_version));
  IF (operation_state->>'replayed')::boolean THEN
    RETURN coalesce((operation_state#>>'{result,renamed}')::boolean,false); END IF;
  SELECT * INTO trip FROM public.trips WHERE id=target_trip_id FOR UPDATE;
  IF NOT FOUND OR trip.version<>expected_version THEN RAISE EXCEPTION 'APP_CONFLICT'
    USING errcode='40001',detail='trip'; END IF;
  IF trip.title IS DISTINCT FROM current_title OR trip.title IS NOT DISTINCT FROM next_title THEN
    PERFORM app_private.complete_trip_operation(target_trip_id,target_operation_id,
      jsonb_build_object('renamed',false,'version',trip.version)); RETURN false; END IF;
  UPDATE public.trips SET title=btrim(next_title),version=version+1 WHERE id=target_trip_id;
  PERFORM app_private.append_trip_history_v2(target_trip_id,target_operation_id,
    'trip.auto_title','trip',target_trip_id,'trip.auto_titled',jsonb_build_object(
      'title',jsonb_build_object('before',trip.title,'after',btrim(next_title))));
  result:=jsonb_build_object('renamed',true,'version',trip.version+1);
  PERFORM app_private.complete_trip_operation(target_trip_id,target_operation_id,result);
  RETURN true;
END $$;

REVOKE EXECUTE ON FUNCTION public.create_trip_v2(text,date,date,text,text,integer,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_trip_v3(text,text,text,text,integer,date,date,uuid) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.rename_trip_if_title_v2(uuid,text,text,bigint,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_trip_v3(text,text,text,text,integer,date,date,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rename_trip_if_title_v2(uuid,text,text,bigint,uuid) TO authenticated;

COMMIT;
