BEGIN;
-- Expose saved city IDs only for dates and city labels in the published page.
-- No provider lookup, coordinates, private IDs, or durable photo data is added.
CREATE FUNCTION public.get_public_city_photo_sources_v1(shared_token uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  projection jsonb;
  shared public.public_itinerary_links%rowtype;
  sources jsonb;
BEGIN
  projection := public.get_public_share_page_v3(shared_token);
  IF coalesce((projection ->> 'available')::boolean, false) IS FALSE
     OR coalesce((projection #>> '{settings,showPlacePhotos}')::boolean, false) IS FALSE THEN
    RETURN '[]'::jsonb;
  END IF;
  SELECT * INTO shared FROM public.public_itinerary_links link
  WHERE link.public_token = shared_token AND link.revoked_at IS NULL;
  IF shared.id IS NULL OR shared.show_place_photos IS FALSE THEN RETURN '[]'::jsonb; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'dayRef', published.value ->> 'ref',
    'ref', encode(extensions.digest(shared.id::text || ':item:' || city.id::text, 'sha256'), 'hex'),
    'googlePlaceId', city.google_place_id,
    'name', city.display_name
  ) ORDER BY published.position), '[]'::jsonb) INTO sources
  FROM jsonb_array_elements(projection -> 'days') WITH ORDINALITY published(value, position)
  JOIN public.trip_days day ON day.variant_id = shared.variant_id
    AND encode(extensions.digest(shared.id::text || ':day:' || day.id::text, 'sha256'), 'hex')
      = published.value ->> 'ref'
  JOIN LATERAL (
    SELECT item.id, place.google_place_id, place.display_name
    FROM public.itinerary_items item
    JOIN public.places place ON place.id = item.place_id AND place.trip_id = shared.trip_id
    WHERE item.trip_id = shared.trip_id AND item.variant_id = shared.variant_id
      AND item.day_id = day.id AND item.type = 'location'
      AND place.source = 'google' AND nullif(btrim(place.google_place_id), '') IS NOT NULL
      AND lower(btrim(place.display_name)) = lower(btrim(coalesce(
        nullif(published.value ->> 'primaryLocality', ''), published.value ->> 'city'
      )))
    ORDER BY item.sort_order, item.id LIMIT 1
  ) city ON true;
  RETURN sources;
END;
$$;
REVOKE ALL ON FUNCTION public.get_public_city_photo_sources_v1(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_city_photo_sources_v1(uuid) TO anon, authenticated;
COMMIT;
