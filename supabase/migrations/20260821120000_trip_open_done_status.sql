-- Existing trips begin active; completed trips remain available without crowding the default list.
alter table public.trips
  add column status text not null default 'open',
  add constraint trips_status_values check (status in ('open', 'done'));

create index trips_owner_status_idx on public.trips (owner_id, status);
