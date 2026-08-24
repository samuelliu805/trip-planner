-- Keep Research journey records canonical and expose their semantic public type.
-- Research Apply already replaces the complete booking field set; this migration
-- makes the generated title part of that canonical boundary as well.

set lock_timeout = '5s';
set statement_timeout = '30s';

-- Repair only system-generated Research journey titles. User-authored transport
-- titles remain untouched.
update public.itinerary_items item
set title = case source.category when 'flight' then 'Flight' else 'Train' end
from public.research_items source
where source.id = nullif(item.details ->> 'researchSourceId', '')::uuid
  and source.trip_id = item.trip_id
  and source.category in ('flight', 'train')
  and item.type = 'transport'
  and item.details ->> 'mode' = source.category
  and (
    lower(btrim(item.title)) = lower(btrim(source.title))
    or (
      nullif(btrim(item.details ->> 'origin'), '') is not null
      and nullif(btrim(item.details ->> 'destination'), '') is not null
      and position(lower(btrim(item.details ->> 'origin')) in lower(item.title)) > 0
      and position(lower(btrim(item.details ->> 'destination')) in lower(item.title)) > 0
    )
  );

-- Applied/Revert snapshots own the title too. Keep the current Applied snapshot
-- aligned with the repaired canonical row so Revert remains conflict-safe.
with rewritten as (
  select
    application.id,
    jsonb_agg(
      case
        when entry.value ->> 'kind' in ('create_item', 'update_item')
          and current_item.id is not null
          and current_item.details ->> 'researchSourceId' is not null
          and current_item.details ->> 'mode' in ('flight', 'train')
        then jsonb_set(
          entry.value,
          '{after,title}',
          to_jsonb(case current_item.details ->> 'mode'
            when 'flight' then 'Flight' else 'Train' end),
          true
        )
        else entry.value
      end
      order by entry.position
    ) as operations
  from public.research_plan_applications application
  cross join lateral jsonb_array_elements(application.operations)
    with ordinality entry(value, position)
  left join public.itinerary_items current_item
    on entry.value ->> 'kind' in ('create_item', 'update_item')
   and current_item.id = nullif(entry.value ->> 'entityId', '')::uuid
   and current_item.trip_id = application.trip_id
   and current_item.variant_id = application.route_variant_id
  where application.status = 'applied'
  group by application.id
), patched as (
  select
    rewritten.id,
    rewritten.operations,
    (
      select coalesce(
        jsonb_agg(coalesce(entry.value -> 'after', 'null'::jsonb) order by entry.position),
        '[]'::jsonb
      )
      from jsonb_array_elements(rewritten.operations)
        with ordinality entry(value, position)
    ) as after_snapshot
  from rewritten
)
update public.research_plan_applications application
set operations = patched.operations,
    after_snapshot = patched.after_snapshot
from patched
where application.id = patched.id
  and application.operations is distinct from patched.operations;

-- Future Apply calls still pass through the complete-field replacement phase.
-- Normalize its generated journey titles afterward and patch the same atomic
-- application snapshot before returning to the caller.
alter function public.apply_research_item_to_variant_v2(uuid, uuid, uuid, uuid, text)
  rename to apply_research_item_to_variant_v2_phase_canonical_transport_titles;
revoke all on function public.apply_research_item_to_variant_v2_phase_canonical_transport_titles(
  uuid, uuid, uuid, uuid, text
) from public, anon, authenticated;

create function public.apply_research_item_to_variant_v2(
  target_trip_id uuid,
  target_variant_id uuid,
  target_research_item_id uuid,
  target_item_id uuid default null,
  schedule_choice text default 'automatic'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  apply_result jsonb;
  application_id uuid;
  affected_item_ids uuid[];
  source_category text;
  canonical_title text;
  patched_operations jsonb;
begin
  apply_result := public.apply_research_item_to_variant_v2_phase_canonical_transport_titles(
    target_trip_id,
    target_variant_id,
    target_research_item_id,
    target_item_id,
    schedule_choice
  );
  select item.category into source_category
  from public.research_items item
  where item.id = target_research_item_id and item.trip_id = target_trip_id;
  if source_category not in ('flight', 'train') then
    return apply_result;
  end if;

  application_id := nullif(apply_result ->> 'applicationId', '')::uuid;
  canonical_title := case source_category when 'flight' then 'Flight' else 'Train' end;
  select coalesce(array_agg(value::uuid), '{}'::uuid[])
  into affected_item_ids
  from jsonb_array_elements_text(coalesce(apply_result -> 'affectedEntityIds', '[]'::jsonb));
  if cardinality(affected_item_ids) = 0 and application_id is not null then
    select application.affected_entity_ids into affected_item_ids
    from public.research_plan_applications application
    where application.id = application_id;
  end if;

  update public.itinerary_items item
  set title = canonical_title
  where item.trip_id = target_trip_id
    and item.variant_id = target_variant_id
    and item.id = any(coalesce(affected_item_ids, '{}'::uuid[]))
    and item.type = 'transport'
    and item.details ->> 'researchSourceId' = target_research_item_id::text
    and item.details ->> 'mode' = source_category
    and item.title is distinct from canonical_title;

  if application_id is null then
    return apply_result;
  end if;
  perform 1
  from public.research_plan_applications application
  where application.id = application_id
  for update;
  select coalesce(
    jsonb_agg(
      case
        when entry.value ->> 'kind' in ('create_item', 'update_item')
          and nullif(entry.value ->> 'entityId', '')::uuid = any(
            coalesce(affected_item_ids, '{}'::uuid[])
          )
        then jsonb_set(entry.value, '{after,title}', to_jsonb(canonical_title), true)
        else entry.value
      end
      order by entry.position
    ),
    '[]'::jsonb
  ) into patched_operations
  from public.research_plan_applications application
  cross join lateral jsonb_array_elements(application.operations)
    with ordinality entry(value, position)
  where application.id = application_id;

  update public.research_plan_applications application
  set operations = patched_operations,
      after_snapshot = (
        select coalesce(
          jsonb_agg(coalesce(entry.value -> 'after', 'null'::jsonb) order by entry.position),
          '[]'::jsonb
        )
        from jsonb_array_elements(patched_operations)
          with ordinality entry(value, position)
      )
  where application.id = application_id;
  return apply_result;
end;
$$;

revoke all on function public.apply_research_item_to_variant_v2(
  uuid, uuid, uuid, uuid, text
) from public, anon;
grant execute on function public.apply_research_item_to_variant_v2(
  uuid, uuid, uuid, uuid, text
) to authenticated;

comment on function public.apply_research_item_to_variant_v2(uuid, uuid, uuid, uuid, text) is
  'Current atomic Apply boundary. Replaces the complete canonical booking field set and uses semantic Flight/Train titles for Research journeys.';

-- Preserve the existing public contract while projecting generic canonical
-- journey rows as their semantic Flight/Train types. Older deployed clients
-- already accept these types, so the migration is rollout-safe.
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

  select link.id, link.template_id, link.template_version, link.trip_id, link.variant_id
  into shared
  from public.public_itinerary_links link
  where link.public_token = shared_token and link.revoked_at is null;
  if shared.id is null then return jsonb_build_object('available', false); end if;

  base_projection := jsonb_set(
    jsonb_set(base_projection, '{settings,templateId}', to_jsonb(shared.template_id), true),
    '{settings,templateVersion}', to_jsonb(shared.template_version), true
  );

  select coalesce(jsonb_agg(
    day_entry.value || jsonb_build_object('items', coalesce((
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
    order by day_entry.position
  ), '[]'::jsonb) into days_projection
  from jsonb_array_elements(base_projection -> 'days')
    with ordinality day_entry(value, position);

  return jsonb_set(base_projection, '{days}', days_projection, false);
end;
$$;

revoke all on function public.get_public_itinerary_v4(uuid)
  from public, anon, authenticated;
grant execute on function public.get_public_itinerary_v4(uuid)
  to anon, authenticated;
