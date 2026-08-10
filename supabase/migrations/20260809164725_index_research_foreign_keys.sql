-- Cover every Phase 6B foreign key from its leading columns. Besides normal
-- joins, these indexes keep canonical-reference SET NULL and trip cascades
-- from scanning the private research tables.

create index research_topics_variant_id_idx
  on public.research_topics (variant_id);
create index research_topics_day_id_idx
  on public.research_topics (day_id);
create index research_topics_end_day_id_idx
  on public.research_topics (end_day_id);
create index research_topics_itinerary_item_id_idx
  on public.research_topics (itinerary_item_id);

create index research_entries_topic_trip_idx
  on public.research_entries (topic_id, trip_id);
create index research_entries_variant_id_idx
  on public.research_entries (variant_id);
create index research_entries_day_id_idx
  on public.research_entries (day_id);
create index research_entries_end_day_id_idx
  on public.research_entries (end_day_id);
create index research_entries_itinerary_item_id_idx
  on public.research_entries (itinerary_item_id);

create index research_options_topic_trip_idx
  on public.research_options (topic_id, trip_id);

create index research_option_entries_trip_id_idx
  on public.research_option_entries (trip_id);
create index research_option_entries_option_trip_idx
  on public.research_option_entries (option_id, trip_id);
create index research_option_entries_entry_trip_idx
  on public.research_option_entries (entry_id, trip_id);
