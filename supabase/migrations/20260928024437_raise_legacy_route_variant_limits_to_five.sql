-- Generated Supabase migration from database/shared/migrations/20260928024437_raise_legacy_route_variant_limits_to_five.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- Versioned creation and duplication still delegate to these legacy implementations.
-- Preserve their provider-specific bodies and ACLs while changing only the known limit check.
DO $$
DECLARE
  function_signature text;
  definition text;
  old_check constant text := 'if (select count(*) from public.route_variants where trip_id = target_trip_id) >= 3 then';
  new_check constant text := 'if (select count(*) from public.route_variants where trip_id = target_trip_id) >= 5 then';
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.create_route_variant(uuid,uuid,text,text)',
    'public.duplicate_route_variant(uuid,uuid,text,text)'
  ] LOOP
    definition := pg_get_functiondef(function_signature::regprocedure);
    IF (length(definition) - length(replace(definition, old_check, ''))) <> length(old_check) THEN
      RAISE EXCEPTION 'Unexpected Plan limit definition in %', function_signature;
    END IF;
    EXECUTE replace(definition, old_check, new_check);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.create_route_variant(uuid,uuid,text,text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.duplicate_route_variant(uuid,uuid,text,text) FROM public, anon, authenticated;

COMMIT;
