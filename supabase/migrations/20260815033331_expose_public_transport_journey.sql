-- Expose only concise route labels for public Flight/Train/Transport entries.
-- The public token remains the authorization boundary; item and owner IDs stay hashed/absent.

create or replace function public.get_public_itinerary_v4(shared_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  base_projection jsonb;
  days_projection jsonb;
  shared record;
begin
  base_projection := public.get_public_itinerary_v3(shared_token);
  if coalesce((base_projection ->> 'available')::boolean, false) is false then
    return base_projection;
  end if;

  select
    link.id,
    link.template_id,
    link.template_version,
    link.trip_id,
    link.variant_id
  into shared
  from public.public_itinerary_links link
  where link.public_token = shared_token
    and link.revoked_at is null;

  if shared.id is null then
    return jsonb_build_object('available', false);
  end if;

  base_projection := jsonb_set(
    jsonb_set(
      base_projection,
      '{settings,templateId}',
      to_jsonb(shared.template_id),
      true
    ),
    '{settings,templateVersion}',
    to_jsonb(shared.template_version),
    true
  );

  select coalesce(
    jsonb_agg(
      day_entry.value || jsonb_build_object(
        'items', coalesce(
          (
            select jsonb_agg(
              item_entry.value || case
                when nullif(btrim(source_item.details ->> 'origin'), '') is not null
                  or nullif(btrim(source_item.details ->> 'destination'), '') is not null
                  or nullif(btrim(source_item.details ->> 'serviceNumber'), '') is not null
                then jsonb_build_object(
                  'transport',
                  jsonb_strip_nulls(jsonb_build_object(
                    'origin', nullif(btrim(source_item.details ->> 'origin'), ''),
                    'destination', nullif(btrim(source_item.details ->> 'destination'), ''),
                    'serviceNumber', nullif(btrim(source_item.details ->> 'serviceNumber'), '')
                  ))
                )
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
                and encode(
                  extensions.digest(
                    shared.id::text || ':item:' || source.id::text,
                    'sha256'
                  ),
                  'hex'
                ) = item_entry.value ->> 'ref'
              limit 1
            ) source_item on true
          ),
          '[]'::jsonb
        )
      )
      order by day_entry.position
    ),
    '[]'::jsonb
  ) into days_projection
  from jsonb_array_elements(base_projection -> 'days')
    with ordinality day_entry(value, position);

  return jsonb_set(base_projection, '{days}', days_projection, false);
end;
$$;

revoke all on function public.get_public_itinerary_v4(uuid)
  from public, anon, authenticated;
grant execute on function public.get_public_itinerary_v4(uuid)
  to anon, authenticated;
