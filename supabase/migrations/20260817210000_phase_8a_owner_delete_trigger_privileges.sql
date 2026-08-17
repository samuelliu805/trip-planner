-- Cascading owner deletes run attachment cleanup as the authenticated caller.
-- Keep the internal queue private while allowing the trigger functions to
-- preserve Storage object paths before attachment metadata disappears.

alter function public.queue_orphan_asset() security definer;
alter function public.queue_deleted_asset() security definer;

revoke all on function public.queue_orphan_asset() from public, anon, authenticated;
revoke all on function public.queue_deleted_asset() from public, anon, authenticated;
