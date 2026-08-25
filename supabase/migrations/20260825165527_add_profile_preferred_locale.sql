alter table public.profiles
  add column preferred_locale text not null default 'en',
  add constraint profiles_preferred_locale_supported
    check (preferred_locale in ('en', 'zh-CN'));

comment on column public.profiles.preferred_locale is
  'BCP 47 locale used for the signed-in Trip Planner interface.';
