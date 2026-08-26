-- Publish a complete, ordered locality sequence from every place-bearing
-- destination category. Neighboring duplicates collapse within a Day, while
-- A -> B -> A remains intact. Refresh only locality-derived data in existing
-- published snapshots so unrelated published content and settings stay frozen.

set lock_timeout = '5s';
set statement_timeout = '30s';

create or replace function public.get_public_itinerary_v4(shared_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  base_projection jsonb;
  city_sequence_projection jsonb;
  days_projection jsonb;
  shared record;
begin
  base_projection := public.get_public_itinerary_v3(shared_token);
  if coalesce((base_projection ->> 'available')::boolean, false) is false then
    return base_projection;
  end if;

  select
    link.id,
    link.show_map_routes,
    link.template_id,
    link.template_version,
    link.trip_id,
    link.variant_id
  into shared
  from public.public_itinerary_links link
  where link.public_token = shared_token and link.revoked_at is null;
  if shared.id is null then return jsonb_build_object('available', false); end if;

  base_projection := jsonb_set(
    jsonb_set(base_projection, '{settings,templateId}', to_jsonb(shared.template_id), true),
    '{settings,templateVersion}', to_jsonb(shared.template_version), true
  );

  select coalesce(jsonb_agg(
    day_entry.value
    || jsonb_build_object('items', coalesce((
      select jsonb_agg(
        item_entry.value
        || case source_item.details ->> 'mode'
          when 'flight' then jsonb_build_object('type', 'flight')
          when 'train' then jsonb_build_object('type', 'train')
          else '{}'::jsonb
        end
        || case
          when nullif(btrim(source_item.details ->> 'origin'), '') is not null
            or nullif(btrim(source_item.details ->> 'destination'), '') is not null
            or nullif(btrim(source_item.details ->> 'serviceNumber'), '') is not null
          then jsonb_build_object('transport', jsonb_strip_nulls(jsonb_build_object(
            'origin', nullif(btrim(source_item.details ->> 'origin'), ''),
            'destination', nullif(btrim(source_item.details ->> 'destination'), ''),
            'serviceNumber', nullif(btrim(source_item.details ->> 'serviceNumber'), '')
          )))
          else '{}'::jsonb
        end
        order by item_entry.position
      )
      from jsonb_array_elements(day_entry.value -> 'items')
        with ordinality item_entry(value, position)
      left join lateral (
        select source.details
        from public.itinerary_items source
        where source.trip_id = shared.trip_id
          and source.variant_id = shared.variant_id
          and source.type in ('flight', 'train', 'transport')
          and encode(extensions.digest(
            shared.id::text || ':item:' || source.id::text, 'sha256'
          ), 'hex') = item_entry.value ->> 'ref'
        limit 1
      ) source_item on true
    ), '[]'::jsonb))
    || case
      when locality.names is null then '{}'::jsonb
      else jsonb_build_object(
        'city', locality.primary_name,
        'primaryLocality', locality.primary_name,
        'localities', locality.names
      )
    end
    order by day_entry.position
  ), '[]'::jsonb) into days_projection
  from jsonb_array_elements(base_projection -> 'days')
    with ordinality day_entry(value, position)
  left join public.trip_days source_day
    on source_day.variant_id = shared.variant_id
   and encode(extensions.digest(
     shared.id::text || ':day:' || source_day.id::text, 'sha256'
   ), 'hex') = day_entry.value ->> 'ref'
  left join lateral (
    select
      (
        select jsonb_agg(sequence.name order by sequence.sort_order, sequence.item_id)
        from (
          select ordered.name, ordered.sort_order, ordered.item_id
          from (
            select
              place.locality_name as name,
              item.sort_order,
              item.id as item_id,
              coalesce(place.country_code, '') || ':' || lower(btrim(place.locality_name))
                as locality_key,
              lag(coalesce(place.country_code, '') || ':' || lower(btrim(place.locality_name)))
                over (order by item.sort_order, item.id) as previous_key
            from public.itinerary_items item
            join public.places place
              on place.id = item.place_id
             and place.trip_id = shared.trip_id
            where item.day_id = source_day.id
              and item.variant_id = shared.variant_id
              and item.trip_id = shared.trip_id
              and item.type in ('activity', 'meal', 'car_rental', 'hotel')
              and nullif(btrim(place.locality_name), '') is not null
          ) ordered
          where ordered.previous_key is distinct from ordered.locality_key
        ) sequence
      ) as names,
      coalesce(
        (
          select place.locality_name
          from public.itinerary_items item
          join public.places place
            on place.id = item.place_id
           and place.trip_id = shared.trip_id
          where item.day_id = source_day.id
            and item.variant_id = shared.variant_id
            and item.trip_id = shared.trip_id
            and item.type = 'hotel'
            and nullif(btrim(place.locality_name), '') is not null
          order by item.sort_order desc, item.id desc
          limit 1
        ),
        (
          select dominant.name
          from (
            select
              (array_agg(place.locality_name order by item.sort_order, item.id))[1] as name,
              count(*) as frequency,
              min(item.sort_order) as first_sort
            from public.itinerary_items item
            join public.places place
              on place.id = item.place_id
             and place.trip_id = shared.trip_id
            where item.day_id = source_day.id
              and item.variant_id = shared.variant_id
              and item.trip_id = shared.trip_id
              and item.type in ('activity', 'meal', 'car_rental', 'hotel')
              and nullif(btrim(place.locality_name), '') is not null
            group by coalesce(place.country_code, ''), lower(btrim(place.locality_name))
            order by frequency desc, first_sort, name
            limit 1
          ) dominant
        )
      ) as primary_name
  ) locality on true;

  with ordered_localities as (
    select
      day.id as day_id,
      day.day_number,
      day.date,
      item.id as item_id,
      item.sort_order,
      place.locality_name as name,
      place.latitude,
      place.longitude,
      coalesce(place.country_code, '') || ':' || lower(btrim(place.locality_name))
        as locality_key,
      lag(coalesce(place.country_code, '') || ':' || lower(btrim(place.locality_name)))
        over (partition by day.id order by item.sort_order, item.id) as previous_key
    from public.trip_days day
    join public.itinerary_items item
      on item.day_id = day.id
     and item.variant_id = shared.variant_id
     and item.trip_id = shared.trip_id
     and item.type in ('activity', 'meal', 'car_rental', 'hotel')
    join public.places place
      on place.id = item.place_id
     and place.trip_id = shared.trip_id
    where day.variant_id = shared.variant_id
      and nullif(btrim(place.locality_name), '') is not null
  )
  select coalesce(jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      'ref', encode(extensions.digest(
        shared.id::text || ':item:' || locality.item_id::text, 'sha256'
      ), 'hex'),
      'dayNumber', locality.day_number,
      'date', locality.date,
      'name', locality.name,
      'latitude', case when shared.show_map_routes then locality.latitude else null end,
      'longitude', case when shared.show_map_routes then locality.longitude else null end
    ))
    order by locality.day_number, locality.sort_order, locality.item_id
  ), '[]'::jsonb)
  into city_sequence_projection
  from ordered_localities locality
  where locality.previous_key is distinct from locality.locality_key;

  return jsonb_set(
    jsonb_set(base_projection, '{days}', days_projection, false),
    '{citySequence}',
    city_sequence_projection,
    false
  );
end;
$$;

revoke all on function public.get_public_itinerary_v4(uuid)
  from public, anon, authenticated;
grant execute on function public.get_public_itinerary_v4(uuid)
  to anon, authenticated;

comment on function public.get_public_itinerary_v4(uuid) is
  'Current public projection with semantic transport rows and complete adjacent-deduplicated Activity, Meal, Car rental, and Hotel locality sequences.';

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
    if not (current_projection @> '{"available":true}'::jsonb) then continue; end if;

    select coalesce(jsonb_agg(
      case
        when current_day.value is null then published_day.value
        else
          (
            published_day.value - 'city' - 'primaryLocality' - 'localities'
            || jsonb_strip_nulls(jsonb_build_object(
              'city', current_day.value -> 'city',
              'primaryLocality', current_day.value -> 'primaryLocality',
              'localities', current_day.value -> 'localities'
            ))
          )
          || jsonb_build_object('items', coalesce((
            select jsonb_agg(
              case
                when current_item.value ? 'place' then jsonb_set(
                  published_item.value,
                  '{place}',
                  current_item.value -> 'place',
                  true
                )
                else published_item.value
              end
              order by published_item.position
            )
            from jsonb_array_elements(published_day.value -> 'items')
              with ordinality published_item(value, position)
            left join lateral (
              select entry.value
              from jsonb_array_elements(current_day.value -> 'items') entry(value)
              where entry.value ->> 'ref' = published_item.value ->> 'ref'
              limit 1
            ) current_item on true
          ), '[]'::jsonb))
      end
      order by published_day.position
    ), '[]'::jsonb)
    into patched_days
    from jsonb_array_elements(managed_link.published_snapshot -> 'days')
      with ordinality published_day(value, position)
    left join lateral (
      select entry.value
      from jsonb_array_elements(current_projection -> 'days') entry(value)
      where entry.value ->> 'ref' = published_day.value ->> 'ref'
      limit 1
    ) current_day on true;

    patched_snapshot := jsonb_set(
      jsonb_set(
        jsonb_set(managed_link.published_snapshot, '{days}', patched_days, false),
        '{citySequence}',
        current_projection -> 'citySequence',
        false
      ),
      '{metadata,coverCities}',
      current_projection #> '{metadata,coverCities}',
      false
    );

    if patched_snapshot is distinct from managed_link.published_snapshot then
      update public.public_itinerary_links link
      set published_snapshot = patched_snapshot,
          snapshot_hash = encode(extensions.digest(patched_snapshot::text, 'sha256'), 'hex')
      where link.id = managed_link.id;
    end if;
  end loop;
end;
$$;
