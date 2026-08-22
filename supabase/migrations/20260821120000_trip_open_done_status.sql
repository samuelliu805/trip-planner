-- Trips gain an explicit lifecycle so the list can default to work in progress instead of history.
-- Every existing trip is open: that is the only state the product had before this migration.
alter table public.trips
  add column status text not null default 'open',
  add constraint trips_status_values check (status in ('open', 'done'));

-- The Trips list always filters by owner and usually by status.
create index trips_owner_status_idx on public.trips (owner_id, status);
