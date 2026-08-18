-- Cover every composite foreign key in its declared column order. These keep
-- owner/trip deletes and referential checks bounded as attachment counts grow.
create index asset_links_asset_owner_idx
  on public.asset_links (asset_id, owner_id);

create index asset_links_item_trip_idx
  on public.asset_links (itinerary_item_id, trip_id);

create index asset_links_trip_owner_idx
  on public.asset_links (trip_id, owner_id);
