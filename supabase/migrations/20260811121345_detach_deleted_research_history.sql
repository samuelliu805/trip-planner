-- Deleting a saved Research candidate must not be blocked by durable Apply
-- history. Keep the narrow before/after snapshots for audit and safe Revert,
-- while removing the live foreign-key relationship to the deleted candidate.

set lock_timeout = '5s';
set statement_timeout = '30s';

alter table public.research_plan_applications
  drop constraint research_plan_applications_research_trip_fkey;

alter table public.research_plan_applications
  alter column source_research_item_id drop not null;

alter table public.research_plan_applications
  add constraint research_plan_applications_research_trip_fkey
  foreign key (source_research_item_id, trip_id)
  references public.research_items (id, trip_id)
  on delete set null (source_research_item_id);

comment on column public.research_plan_applications.source_research_item_id is
  'Source ResearchItem when it still exists. NULL after the saved candidate is deleted; durable Apply snapshots remain available.';
