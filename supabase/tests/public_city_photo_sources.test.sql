BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(10);
GRANT EXECUTE ON FUNCTION public.create_trip(text,date,date,text,text,integer) TO authenticated;
INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
VALUES ('00000000-0000-0000-0000-000000000000','63000000-0000-4000-8000-000000000001','authenticated','authenticated','city-photo-owner@example.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
CREATE TEMP TABLE city_photo_state(key text PRIMARY KEY,id uuid,payload jsonb);
GRANT ALL ON city_photo_state TO authenticated,anon;
SELECT set_config('request.jwt.claims','{"sub":"63000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
INSERT INTO city_photo_state(key,id) SELECT 'trip',public.create_trip('City photo scope','2027-04-12','2027-04-13','UTC','USD',2);
RESET ROLE;
INSERT INTO city_photo_state(key,id) SELECT 'variant',id FROM public.route_variants WHERE trip_id=(SELECT id FROM city_photo_state WHERE key='trip') AND is_primary;
INSERT INTO public.places(trip_id,source,google_place_id,provider_place_id,display_name,latitude,longitude,locality_name,locality_kind,locality_source)
SELECT id,'google','saved-paris-city','saved-paris-city','Paris',48.8566,2.3522,'Paris','locality','google_address_component' FROM city_photo_state WHERE key='trip';
INSERT INTO public.itinerary_items(trip_id,variant_id,day_id,type,title,place_id,sort_order)
SELECT place.trip_id,day.variant_id,day.id,'location','Paris',place.id,0 FROM public.places place JOIN public.trip_days day ON day.variant_id=(SELECT id FROM city_photo_state WHERE key='variant') WHERE place.trip_id=(SELECT id FROM city_photo_state WHERE key='trip');
INSERT INTO public.public_itinerary_links(trip_id,variant_id,created_by,show_place_photos,show_attachments,published_snapshot)
SELECT (SELECT id FROM city_photo_state WHERE key='trip'),id,'63000000-0000-4000-8000-000000000001',true,false,'{"available":true,"settings":{"showPlacePhotos":true},"days":[]}'::jsonb FROM city_photo_state WHERE key='variant';
INSERT INTO city_photo_state(key,id,payload) SELECT 'link',id,jsonb_build_object('token',public_token) FROM public.public_itinerary_links WHERE trip_id=(SELECT id FROM city_photo_state WHERE key='trip');
UPDATE public.public_itinerary_links link SET published_snapshot=jsonb_set(published_snapshot,'{days}',jsonb_build_array(jsonb_build_object('ref',encode(extensions.digest(link.id::text||':day:'||day.id::text,'sha256'),'hex'),'city','Paris'))) FROM public.trip_days day WHERE link.id=(SELECT id FROM city_photo_state WHERE key='link') AND day.variant_id=link.variant_id AND day.day_number=1;
SELECT ok(has_function_privilege('anon','public.get_public_city_photo_sources_v1(uuid)','EXECUTE'),'anonymous callers can use the guarded source RPC');
SET LOCAL ROLE anon;
INSERT INTO city_photo_state(key,payload) SELECT 'sources',public.get_public_city_photo_sources_v1(((SELECT payload->>'token' FROM city_photo_state WHERE key='link'))::uuid);
SELECT is(jsonb_array_length((SELECT payload FROM city_photo_state WHERE key='sources')),1,'only published dates expose saved city sources');
SELECT is((SELECT payload#>>'{0,googlePlaceId}' FROM city_photo_state WHERE key='sources'),'saved-paris-city','returns the saved city ID without searching');
SELECT matches((SELECT payload#>>'{0,ref}' FROM city_photo_state WHERE key='sources'),'^[0-9a-f]{64}$','source references are opaque salted hashes');
SELECT is(public.get_public_city_photo_sources_v1('63000000-0000-4000-8000-000000000099'),'[]'::jsonb,'unknown tokens expose nothing');
RESET ROLE;
UPDATE public.public_itinerary_links SET published_snapshot=jsonb_set(published_snapshot,'{days,0,city}','"London"') WHERE id=(SELECT id FROM city_photo_state WHERE key='link');
SELECT is(public.get_public_city_photo_sources_v1(((SELECT payload->>'token' FROM city_photo_state WHERE key='link'))::uuid),'[]'::jsonb,'a private city cannot replace the published city');
UPDATE public.public_itinerary_links SET published_snapshot=jsonb_set(published_snapshot,'{days,0,city}','"Paris"'),show_place_photos=false WHERE id=(SELECT id FROM city_photo_state WHERE key='link');
SELECT is(public.get_public_city_photo_sources_v1(((SELECT payload->>'token' FROM city_photo_state WHERE key='link'))::uuid),'[]'::jsonb,'the current photo permission is checked');
UPDATE public.public_itinerary_links SET show_place_photos=true,published_snapshot=jsonb_set(published_snapshot,'{settings,showPlacePhotos}','false') WHERE id=(SELECT id FROM city_photo_state WHERE key='link');
SELECT is(public.get_public_city_photo_sources_v1(((SELECT payload->>'token' FROM city_photo_state WHERE key='link'))::uuid),'[]'::jsonb,'a snapshot published without photos remains photo free');
UPDATE public.public_itinerary_links SET published_snapshot=jsonb_set(published_snapshot,'{settings,showPlacePhotos}','true'),revoked_at=now() WHERE id=(SELECT id FROM city_photo_state WHERE key='link');
SELECT is(public.get_public_city_photo_sources_v1(((SELECT payload->>'token' FROM city_photo_state WHERE key='link'))::uuid),'[]'::jsonb,'revoked links expose nothing');
SELECT ok(NOT has_table_privilege('anon','public.places','SELECT'),'city sources do not grant direct private-place reads');
SELECT * FROM finish();
ROLLBACK;
