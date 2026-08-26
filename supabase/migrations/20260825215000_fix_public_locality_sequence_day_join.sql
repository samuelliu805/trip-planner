-- The deployed trip_days table is scoped through variant_id and has no trip_id
-- column. Patch the just-deployed projection in place while remaining a no-op
-- for clean databases where the preceding migration is already corrected.
do $$
declare
  current_definition text;
  corrected_definition text;
begin
  select pg_get_functiondef('public.get_public_itinerary_v4(uuid)'::regprocedure)
  into current_definition;

  if position('source_day.trip_id' in current_definition) = 0 then
    return;
  end if;

  corrected_definition := regexp_replace(
    current_definition,
    'source_day\.trip_id = shared\.trip_id[[:space:]]+and source_day\.variant_id',
    'source_day.variant_id'
  );

  if corrected_definition = current_definition then
    raise exception 'PUBLIC_LOCALITY_DAY_JOIN_PATCH_FAILED';
  end if;

  execute corrected_definition;
end;
$$;
