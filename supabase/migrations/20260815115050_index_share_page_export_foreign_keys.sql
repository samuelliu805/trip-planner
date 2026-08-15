-- Cover every referencing side introduced or recreated by the durable
-- Share Page and Timeline export migration. These indexes keep parent deletes,
-- destination lookups, and owner cleanup from scanning the child tables.

create index public_itinerary_links_qr_share_page_idx
  on public.public_itinerary_links (long_image_qr_share_page_id);

create index public_itinerary_links_variant_trip_idx
  on public.public_itinerary_links (variant_id, trip_id);

create index share_image_exports_current_version_idx
  on public.share_image_exports (current_version_id);

create index share_image_exports_owner_idx
  on public.share_image_exports (owner_id);
