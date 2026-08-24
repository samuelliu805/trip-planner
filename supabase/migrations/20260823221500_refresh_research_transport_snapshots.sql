-- Refresh complete published item objects for Research Flight/Train rows whose
-- canonical presentation changed. Preserve every unrelated published item and
-- Share Page setting.

set lock_timeout = '5s';
set statement_timeout = '30s';

do $$
declare
  managed_link public.public_itinerary_links%rowtype;
  current_projection jsonb;
  patched_days jsonb;
  patched_snapshot jsonb;
begin
  for managed_link in
    select link.*
    from public.public_itinerary_links link
    where link.revoked_at is null
      and link.trip_id is not null
      and link.variant_id is not null
      and link.published_snapshot @> '{"available":true}'::jsonb
    order by link.id
    for update
  loop
    current_projection := public.get_public_itinerary_v4(managed_link.public_token);
    if not (current_projection @> '{"available":true}'::jsonb) then
      continue;
    end if;

    select coalesce(
      jsonb_agg(
        published_day.value || jsonb_build_object(
          'items', coalesce((
            select jsonb_agg(
              case
                when exists (
                  select 1
                  from public.itinerary_items source_item
                  where source_item.trip_id = managed_link.trip_id
                    and source_item.variant_id = managed_link.variant_id
                    and source_item.type = 'transport'
                    and source_item.details ->> 'researchSourceId' is not null
                    and source_item.details ->> 'mode' in ('flight', 'train')
                    and encode(
                      extensions.digest(
                        managed_link.id::text || ':item:' || source_item.id::text,
                        'sha256'
                      ),
                      'hex'
                    ) = published_item.value ->> 'ref'
                )
                then coalesce((
                  select current_item.value
                  from jsonb_array_elements(current_projection -> 'days') current_day(value)
                  cross join lateral jsonb_array_elements(current_day.value -> 'items')
                    current_item(value)
                  where current_item.value ->> 'ref' = published_item.value ->> 'ref'
                  limit 1
                ), published_item.value)
                else published_item.value
              end
              order by published_item.position
            )
            from jsonb_array_elements(published_day.value -> 'items')
              with ordinality published_item(value, position)
          ), '[]'::jsonb)
        )
        order by published_day.position
      ),
      '[]'::jsonb
    ) into patched_days
    from jsonb_array_elements(managed_link.published_snapshot -> 'days')
      with ordinality published_day(value, position);

    patched_snapshot := jsonb_set(
      managed_link.published_snapshot,
      '{days}',
      patched_days,
      false
    );
    if patched_snapshot is distinct from managed_link.published_snapshot then
      update public.public_itinerary_links link
      set published_snapshot = patched_snapshot,
          snapshot_hash = encode(
            extensions.digest(patched_snapshot::text, 'sha256'),
            'hex'
          )
      where link.id = managed_link.id;
    end if;
  end loop;
end;
$$;
