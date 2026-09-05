BEGIN;

alter table public.research_items
  add column adult_count smallint,
  add column child_count smallint,
  add column room_count smallint,
  add constraint research_items_adult_count_check
    check (adult_count is null or (adult_count between 1 and 20 and category <> 'rental')),
  add constraint research_items_child_count_check
    check (child_count is null or (child_count between 0 and 20 and category <> 'rental')),
  add constraint research_items_room_count_check
    check (room_count is null or (room_count between 1 and 10 and category = 'stay'));

comment on column public.research_items.adult_count is
  'Optional number of adult travelers used to prefill booking-provider searches.';
comment on column public.research_items.child_count is
  'Optional number of child travelers used to prefill booking-provider searches.';
comment on column public.research_items.room_count is
  'Optional number of rooms used to prefill stay-provider searches.';

COMMIT;
