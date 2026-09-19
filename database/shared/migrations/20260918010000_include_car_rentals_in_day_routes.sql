BEGIN;

DO $$
DECLARE
  function_oid regprocedure := to_regprocedure(
    'public.save_day_route_plan(uuid,uuid,uuid[],text[])'
  );
  definition text;
  previous_fragment text := 'item.type not in (''activity'', ''meal'', ''hotel'')';
BEGIN
  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'SAVE_DAY_ROUTE_PLAN_MISSING';
  END IF;
  definition := pg_get_functiondef(function_oid);
  IF position(previous_fragment IN definition) = 0 THEN
    RAISE EXCEPTION 'SAVE_DAY_ROUTE_PLAN_ELIGIBILITY_DRIFT';
  END IF;
  definition := replace(
    definition,
    previous_fragment,
    'item.type not in (''activity'', ''meal'', ''car_rental'', ''hotel'')'
  );
  EXECUTE definition;
END;
$$;

COMMIT;
