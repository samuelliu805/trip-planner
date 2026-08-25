alter table public.profiles
  add column home_city text,
  add constraint profiles_home_city_length
    check (home_city is null or char_length(btrim(home_city)) between 1 and 120);

comment on column public.profiles.home_city is
  'Optional user-entered home city used for future trip defaults.';
