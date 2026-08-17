-- Avoid trying to update an asset that is already being deleted by an owner
-- cascade. The asset before-delete trigger has already preserved its Storage
-- paths in the durable queue in this branch.

create or replace function public.queue_orphan_asset()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  orphan_id uuid := old.asset_id;
begin
  if tg_op = 'UPDATE' and new.asset_id = old.asset_id then return new; end if;
  if exists (
    select 1 from public.asset_deletion_queue queue where queue.asset_id = orphan_id
  ) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if exists (select 1 from public.asset_links link where link.asset_id = orphan_id) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  update public.assets set status = 'deleting', pending_expires_at = null
  where id = orphan_id and status <> 'deleting';
  insert into public.asset_deletion_queue (
    asset_id, owner_id, bucket, object_key, thumbnail_object_key
  )
  select asset.id, asset.owner_id, asset.bucket, asset.object_key, asset.thumbnail_object_key
  from public.assets asset where asset.id = orphan_id
  on conflict (asset_id) do update set next_attempt_at = now(), updated_at = now();
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
