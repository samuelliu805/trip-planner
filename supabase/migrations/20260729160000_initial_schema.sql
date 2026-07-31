create extension if not exists pgcrypto;
create type public.trip_member_role as enum ('owner', 'editor', 'viewer');
create type public.place_source as enum ('google', 'custom');
create type public.itinerary_item_type as enum (
  'hotel',
  'activity',
  'meal',
  'transport',
  'location',
  'car_rental',
  'flight',
  'train',
  'note'
);
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (
    username is null or username ~ '^[a-zA-Z0-9_]{3,30}$'
  )
);
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  start_date date not null,
  end_date date not null,
  timezone text not null,
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trips_title_length check (char_length(btrim(title)) between 1 and 120),
  constraint trips_date_order check (end_date >= start_date),
  constraint trips_currency_format check (currency ~ '^[A-Z]{3}$')
);
create table public.trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.trip_member_role not null,
  constraint trip_members_trip_user_unique unique (trip_id, user_id)
);
create table public.route_variants (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  name text not null,
  color text not null default '#0f766e',
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  constraint route_variants_name_length check (char_length(btrim(name)) between 1 and 80),
  constraint route_variants_color_format check (color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint route_variants_trip_name_unique unique (trip_id, name)
);
create unique index route_variants_one_primary_per_trip
  on public.route_variants (trip_id)
  where is_primary;
create table public.trip_days (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.route_variants (id) on delete cascade,
  day_number integer not null,
  date date not null,
  title text,
  notes text,
  constraint trip_days_positive_number check (day_number > 0),
  constraint trip_days_variant_day_unique unique (variant_id, day_number),
  constraint trip_days_variant_date_unique unique (variant_id, date)
);
create table public.places (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  source public.place_source not null,
  google_place_id text,
  custom_name text,
  custom_lat double precision,
  custom_lng double precision,
  constraint places_source_fields check (
    (source = 'google' and google_place_id is not null and custom_name is null and custom_lat is null and custom_lng is null)
    or
    (source = 'custom' and google_place_id is null and custom_name is not null and custom_lat is not null and custom_lng is not null)
  ),
  constraint places_latitude_range check (custom_lat is null or custom_lat between -90 and 90),
  constraint places_longitude_range check (custom_lng is null or custom_lng between -180 and 180)
);
create table public.itinerary_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  variant_id uuid not null references public.route_variants (id) on delete cascade,
  day_id uuid not null references public.trip_days (id) on delete cascade,
  type public.itinerary_item_type not null,
  title text not null,
  start_time time,
  end_time time,
  place_id uuid references public.places (id) on delete set null,
  notes text,
  booking_url text,
  details jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint itinerary_items_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint itinerary_items_time_order check (end_time is null or start_time is null or end_time >= start_time),
  constraint itinerary_items_details_object check (jsonb_typeof(details) = 'object')
);
create index trips_owner_id_idx on public.trips (owner_id);
create index trips_dates_idx on public.trips (start_date, end_date);
create index trip_members_user_id_idx on public.trip_members (user_id);
create index trip_members_trip_id_idx on public.trip_members (trip_id);
create index route_variants_trip_id_idx on public.route_variants (trip_id);
create index trip_days_variant_id_idx on public.trip_days (variant_id);
create index places_trip_id_idx on public.places (trip_id);
create unique index places_google_id_per_trip_idx
  on public.places (trip_id, google_place_id)
  where google_place_id is not null;
create index itinerary_items_trip_id_idx on public.itinerary_items (trip_id);
create index itinerary_items_variant_id_idx on public.itinerary_items (variant_id);
create index itinerary_items_day_order_idx on public.itinerary_items (day_id, sort_order);
create index itinerary_items_place_id_idx on public.itinerary_items (place_id);
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger trips_set_updated_at
before update on public.trips
for each row execute function public.set_updated_at();
create trigger itinerary_items_set_updated_at
before update on public.itinerary_items
for each row execute function public.set_updated_at();
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
create or replace function public.is_trip_member(target_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trip_members
    where trip_id = target_trip_id
      and user_id = (select auth.uid())
  );
$$;
create or replace function public.is_trip_owner(target_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trip_members
    where trip_id = target_trip_id
      and user_id = (select auth.uid())
      and role = 'owner'
  );
$$;
create or replace function public.variant_trip_id(target_variant_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select trip_id from public.route_variants where id = target_variant_id;
$$;
create or replace function public.create_trip(
  trip_title text,
  trip_start_date date,
  trip_end_date date,
  trip_timezone text,
  trip_currency text default 'USD'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_trip_id uuid;
  new_variant_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if char_length(btrim(trip_title)) not between 1 and 120 then
    raise exception 'Trip title must be between 1 and 120 characters' using errcode = '22023';
  end if;

  if trip_end_date < trip_start_date then
    raise exception 'End date must be on or after start date' using errcode = '22023';
  end if;

  if trip_end_date - trip_start_date > 365 then
    raise exception 'Trips cannot exceed 366 days' using errcode = '22023';
  end if;

  if not exists (select 1 from pg_catalog.pg_timezone_names where name = trip_timezone) then
    raise exception 'Invalid timezone' using errcode = '22023';
  end if;

  if trip_currency !~ '^[A-Z]{3}$' then
    raise exception 'Currency must be a three-letter ISO code' using errcode = '22023';
  end if;

  insert into public.trips (owner_id, title, start_date, end_date, timezone, currency)
  values (current_user_id, btrim(trip_title), trip_start_date, trip_end_date, trip_timezone, trip_currency)
  returning id into new_trip_id;

  insert into public.trip_members (trip_id, user_id, role)
  values (new_trip_id, current_user_id, 'owner');

  insert into public.route_variants (trip_id, name, color, is_primary)
  values (new_trip_id, 'Route A', '#0f766e', true)
  returning id into new_variant_id;

  insert into public.trip_days (variant_id, day_number, date)
  select
    new_variant_id,
    row_number() over (order by generated_date)::integer,
    generated_date::date
  from generate_series(trip_start_date, trip_end_date, interval '1 day') as dates(generated_date);

  return new_trip_id;
end;
$$;
revoke all on function public.set_updated_at() from public;
revoke all on function public.handle_new_user() from public;
revoke all on function public.is_trip_member(uuid) from public;
revoke all on function public.is_trip_owner(uuid) from public;
revoke all on function public.variant_trip_id(uuid) from public;
revoke all on function public.create_trip(text, date, date, text, text) from public;
grant execute on function public.is_trip_member(uuid) to authenticated;
grant execute on function public.is_trip_owner(uuid) to authenticated;
grant execute on function public.variant_trip_id(uuid) to authenticated;
grant execute on function public.create_trip(text, date, date, text, text) to authenticated;
alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.route_variants enable row level security;
alter table public.trip_days enable row level security;
alter table public.places enable row level security;
alter table public.itinerary_items enable row level security;
create policy "profiles_select_self" on public.profiles
for select to authenticated
using (id = (select auth.uid()));
create policy "profiles_insert_self" on public.profiles
for insert to authenticated
with check (id = (select auth.uid()));
create policy "profiles_update_self" on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));
create policy "trips_select_members" on public.trips
for select to authenticated
using (public.is_trip_member(id));
create policy "trips_update_owners" on public.trips
for update to authenticated
using (public.is_trip_owner(id))
with check (owner_id = (select auth.uid()) and public.is_trip_owner(id));
create policy "trips_delete_owners" on public.trips
for delete to authenticated
using (public.is_trip_owner(id));
create policy "trip_members_select_members" on public.trip_members
for select to authenticated
using (public.is_trip_member(trip_id));
create policy "trip_members_insert_owners" on public.trip_members
for insert to authenticated
with check (public.is_trip_owner(trip_id));
create policy "trip_members_update_owners" on public.trip_members
for update to authenticated
using (public.is_trip_owner(trip_id))
with check (public.is_trip_owner(trip_id));
create policy "trip_members_delete_owners" on public.trip_members
for delete to authenticated
using (public.is_trip_owner(trip_id));
create policy "route_variants_select_members" on public.route_variants
for select to authenticated
using (public.is_trip_member(trip_id));
create policy "route_variants_insert_owners" on public.route_variants
for insert to authenticated
with check (public.is_trip_owner(trip_id));
create policy "route_variants_update_owners" on public.route_variants
for update to authenticated
using (public.is_trip_owner(trip_id))
with check (public.is_trip_owner(trip_id));
create policy "route_variants_delete_owners" on public.route_variants
for delete to authenticated
using (public.is_trip_owner(trip_id));
create policy "trip_days_select_members" on public.trip_days
for select to authenticated
using (public.is_trip_member(public.variant_trip_id(variant_id)));
create policy "trip_days_insert_owners" on public.trip_days
for insert to authenticated
with check (public.is_trip_owner(public.variant_trip_id(variant_id)));
create policy "trip_days_update_owners" on public.trip_days
for update to authenticated
using (public.is_trip_owner(public.variant_trip_id(variant_id)))
with check (public.is_trip_owner(public.variant_trip_id(variant_id)));
create policy "trip_days_delete_owners" on public.trip_days
for delete to authenticated
using (public.is_trip_owner(public.variant_trip_id(variant_id)));
create policy "places_select_members" on public.places
for select to authenticated
using (public.is_trip_member(trip_id));
create policy "places_insert_owners" on public.places
for insert to authenticated
with check (public.is_trip_owner(trip_id));
create policy "places_update_owners" on public.places
for update to authenticated
using (public.is_trip_owner(trip_id))
with check (public.is_trip_owner(trip_id));
create policy "places_delete_owners" on public.places
for delete to authenticated
using (public.is_trip_owner(trip_id));
create policy "itinerary_items_select_members" on public.itinerary_items
for select to authenticated
using (public.is_trip_member(trip_id));
create policy "itinerary_items_insert_owners" on public.itinerary_items
for insert to authenticated
with check (
  public.is_trip_owner(trip_id)
  and public.variant_trip_id(variant_id) = trip_id
  and exists (
    select 1 from public.trip_days
    where id = day_id and variant_id = itinerary_items.variant_id
  )
  and (place_id is null or exists (
    select 1 from public.places
    where id = itinerary_items.place_id and trip_id = itinerary_items.trip_id
  ))
);
create policy "itinerary_items_update_owners" on public.itinerary_items
for update to authenticated
using (public.is_trip_owner(trip_id))
with check (
  public.is_trip_owner(trip_id)
  and public.variant_trip_id(variant_id) = trip_id
  and exists (
    select 1 from public.trip_days
    where id = day_id and variant_id = itinerary_items.variant_id
  )
  and (place_id is null or exists (
    select 1 from public.places
    where id = itinerary_items.place_id and trip_id = itinerary_items.trip_id
  ))
);
create policy "itinerary_items_delete_owners" on public.itinerary_items
for delete to authenticated
using (public.is_trip_owner(trip_id));
