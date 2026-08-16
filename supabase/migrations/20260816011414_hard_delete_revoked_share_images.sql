create function public.owns_share_image_object_v1(requested_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.share_image_versions version
    join public.share_image_exports export on export.id = version.export_id
    where export.owner_id = auth.uid()
      and export.revoked_at is null
      and version.id::text = (storage.foldername(requested_name))[3]
      and (storage.foldername(requested_name))[1] = export.owner_id::text
      and (storage.foldername(requested_name))[2] = export.id::text
      and requested_name ~ (
        '^' || export.owner_id::text || '/' || export.id::text || '/'
        || version.id::text || '/part-[1-9][0-9]*\.jpg$'
      )
  );
$$;

create function public.owner_share_image_export_paths_v1(target_export_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_agg(part.storage_path order by version.version_number, part.part_number)
      from public.share_image_exports export
      join public.share_image_versions version on version.export_id = export.id
      join public.share_image_parts part on part.version_id = version.id
      where export.id = target_export_id
        and export.owner_id = auth.uid()
        and export.revoked_at is null
    ),
    '[]'::jsonb
  );
$$;

drop policy if exists "owners remove their share image uploads" on storage.objects;
create policy "owners remove their share images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'share-images'
  and public.owns_share_image_object_v1(name)
);

revoke all on function public.owns_share_image_object_v1(text)
  from public, anon, authenticated;
revoke all on function public.owner_share_image_export_paths_v1(uuid)
  from public, anon, authenticated;

grant execute on function public.owns_share_image_object_v1(text) to authenticated;
grant execute on function public.owner_share_image_export_paths_v1(uuid) to authenticated;
