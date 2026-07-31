create unique index itinerary_items_unique_transport_mode_per_day
  on public.itinerary_items (day_id, (details ->> 'mode'))
  where type = 'transport' and details ->> 'mode' is not null;
