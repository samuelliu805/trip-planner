-- Fail-closed post-deployment verification. A successful run returns one row.
DO $verify_cloudbase_security$
DECLARE
  expected_authenticated oid[] := ARRAY[
    to_regprocedure('public.apply_research_item_to_variant_v2(uuid,uuid,uuid,uuid,text)')::oid,
    to_regprocedure('public.clear_day_route_plan(uuid,uuid)')::oid,
    to_regprocedure('public.clear_route_variant_items(uuid,uuid,uuid[])')::oid,
    to_regprocedure('public.create_route_variant(uuid,uuid,text,text)')::oid,
    to_regprocedure('public.create_share_page_v3(uuid,public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,integer,boolean,text,uuid,integer,integer,boolean)')::oid,
    to_regprocedure('public.create_trip(text,date,date,text,text,integer)')::oid,
    to_regprocedure('public.current_research_plan_application_ids(uuid,uuid)')::oid,
    to_regprocedure('public.delete_route_variant(uuid,uuid)')::oid,
    to_regprocedure('public.duplicate_route_variant(uuid,uuid,text,text)')::oid,
    to_regprocedure('public.get_public_itinerary_v4(uuid)')::oid,
    to_regprocedure('public.get_public_share_page_v3(uuid)')::oid,
    to_regprocedure('public.insert_variant_day(uuid,uuid,integer)')::oid,
    to_regprocedure('public.is_trip_owner(uuid)')::oid,
    to_regprocedure('public.list_share_pages_v2(uuid)')::oid,
    to_regprocedure('public.owner_share_page_by_token_v2(uuid)')::oid,
    to_regprocedure('public.owner_share_page_v2(uuid)')::oid,
    to_regprocedure('public.remove_variant_day(uuid,uuid,uuid)')::oid,
    to_regprocedure('public.reorder_itinerary_items(uuid,uuid[])')::oid,
    to_regprocedure('public.reorder_variant_days(uuid,uuid,uuid[])')::oid,
    to_regprocedure('public.revert_research_plan_application(uuid,uuid)')::oid,
    to_regprocedure('public.revoke_share_page_v1(uuid)')::oid,
    to_regprocedure('public.save_day_route_calculation(uuid,text,jsonb,integer,integer,text)')::oid,
    to_regprocedure('public.save_day_route_plan(uuid,uuid,uuid[],text[])')::oid,
    to_regprocedure('public.set_primary_route_variant(uuid,uuid)')::oid,
    to_regprocedure('public.update_route_variant_metadata(uuid,uuid,text,text)')::oid,
    to_regprocedure('public.update_share_page_v3(uuid,public_itinerary_view,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text,integer,boolean,text,uuid,integer,integer,boolean)')::oid,
    to_regprocedure('public.update_trip_plan(uuid,text,date,date,integer,text,text)')::oid,
    to_regprocedure('public.upsert_google_place_snapshot_v2(uuid,text,text,text,double precision,double precision,text,text,text,text)')::oid
  ];
  expected_anon oid[] := ARRAY[
    to_regprocedure('public.get_public_itinerary_v4(uuid)')::oid,
    to_regprocedure('public.get_public_share_page_v3(uuid)')::oid
  ];
  actual_authenticated oid[];
  actual_anon oid[];
  migration_owner oid;
BEGIN
  IF array_position(expected_authenticated, NULL) IS NOT NULL OR array_position(expected_anon, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Reviewed RPC allowlist contains a missing function';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)
  ) THEN RAISE EXCEPTION 'A public business table lacks ENABLE/FORCE RLS'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polcmd = 'w'
      AND (p.polqual IS NULL OR p.polwithcheck IS NULL)
  ) THEN RAISE EXCEPTION 'An UPDATE policy lacks USING or WITH CHECK'; END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE grantee = 'anon' AND table_schema = 'public'
  ) THEN RAISE EXCEPTION 'anon has an unexpected public table privilege'; END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE grantee = 'authenticated' AND table_schema = 'public'
      AND table_name IN (
        'app_schema_migrations', 'asset_deletion_queue', 'public_itinerary_links',
        'share_image_exports', 'share_image_parts', 'share_image_versions'
      )
  ) THEN RAISE EXCEPTION 'authenticated has direct access to an RPC-only/private table'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'app_private') AND p.prosecdef
      AND NOT ('search_path=""' = ANY (coalesce(p.proconfig, ARRAY[]::text[])))
  ) THEN RAISE EXCEPTION 'A SECURITY DEFINER function has an unsafe search_path'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'app_private')
      AND has_function_privilege('public', p.oid, 'EXECUTE')
  ) THEN RAISE EXCEPTION 'PUBLIC has unexpected function EXECUTE'; END IF;

  SELECT p.proowner INTO migration_owner
  FROM pg_catalog.pg_proc p
  WHERE p.oid = to_regprocedure('public.create_trip(text,date,date,text,text,integer)');
  IF migration_owner IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_default_acl d
      WHERE d.defaclrole = migration_owner AND d.defaclobjtype = 'f'
        AND d.defaclnamespace = 0
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_default_acl d
      JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace
      WHERE d.defaclrole = migration_owner AND d.defaclobjtype = 'f'
        AND n.nspname = 'public'
    )
  THEN RAISE EXCEPTION 'Migration owner lacks fail-closed function default privileges'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_default_acl d
    LEFT JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) acl
    LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
    WHERE d.defaclrole = migration_owner AND d.defaclobjtype = 'f'
      AND (d.defaclnamespace = 0 OR n.nspname IN ('public', 'app_private'))
      AND acl.privilege_type = 'EXECUTE'
      AND (acl.grantee = 0 OR grantee.rolname IN ('anon', 'authenticated'))
  ) THEN RAISE EXCEPTION 'A browser role has unsafe default function EXECUTE'; END IF;

  SELECT coalesce(array_agg(p.oid ORDER BY p.oid), ARRAY[]::oid[]) INTO actual_authenticated
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  SELECT coalesce(array_agg(p.oid ORDER BY p.oid), ARRAY[]::oid[]) INTO actual_anon
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF EXISTS (
    (SELECT unnest(actual_authenticated) EXCEPT SELECT unnest(expected_authenticated))
    UNION ALL
    (SELECT unnest(expected_authenticated) EXCEPT SELECT unnest(actual_authenticated))
  ) THEN RAISE EXCEPTION 'authenticated callable catalog differs from the reviewed allowlist'; END IF;
  IF EXISTS (
    (SELECT unnest(actual_anon) EXCEPT SELECT unnest(expected_anon))
    UNION ALL
    (SELECT unnest(expected_anon) EXCEPT SELECT unnest(actual_anon))
  ) THEN RAISE EXCEPTION 'anon callable catalog differs from the reviewed allowlist'; END IF;

  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('profiles', 'id'), ('trips', 'owner_id'), ('trip_members', 'user_id'),
      ('public_itinerary_links', 'created_by'), ('research_plan_applications', 'applied_by'),
      ('share_image_exports', 'owner_id'), ('assets', 'owner_id'),
      ('asset_links', 'owner_id'), ('asset_deletion_queue', 'owner_id')
    ) expected(table_name, column_name)
    LEFT JOIN information_schema.columns c ON c.table_schema = 'public'
      AND c.table_name = expected.table_name AND c.column_name = expected.column_name
    WHERE c.data_type <> 'character varying' OR c.character_maximum_length <> 64
      OR c.column_name IS NULL
  ) THEN RAISE EXCEPTION 'A CloudBase ownership column is not varchar(64)'; END IF;

  IF to_regprocedure('public.phase2_rename_owned_trip(uuid,text)') IS NOT NULL
    OR to_regprocedure('public.app_current_user_id()') IS NOT NULL
    OR to_regprocedure('public.is_trip_member(uuid)') IS NOT NULL
    OR to_regprocedure('public.variant_trip_id(uuid)') IS NOT NULL
  THEN RAISE EXCEPTION 'A removed/private helper remains in the exposed public schema'; END IF;
END;
$verify_cloudbase_security$;

SELECT 'cloudbase_security_verified' AS result;
