-- Assertion-based SQL/session-claim A/B matrix. The transaction always rolls back its fixtures.
BEGIN;

CREATE TEMPORARY TABLE phase2_security_state (
  key text PRIMARY KEY,
  value text NOT NULL
);
GRANT ALL ON phase2_security_state TO authenticated, anon;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"2094243777574084609","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
INSERT INTO phase2_security_state (key, value)
SELECT 'a_trip', public.create_trip('Phase 2 SQL A', NULL, NULL, 'UTC', 'USD', 1)::text;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"2094243874682974210","role":"authenticated"}',
  true
);
INSERT INTO phase2_security_state (key, value)
SELECT 'b_trip', public.create_trip('Phase 2 SQL B', NULL, NULL, 'UTC', 'USD', 1)::text;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"2094243777574084609","role":"authenticated"}',
  true
);

DO $assert_private_rls$
DECLARE
  affected integer;
BEGIN
  IF (SELECT count(*) FROM public.trips WHERE id = (SELECT value::uuid FROM phase2_security_state WHERE key = 'a_trip')) <> 1 THEN
    RAISE EXCEPTION 'A cannot read its own trip';
  END IF;
  IF (SELECT count(*) FROM public.trips WHERE id = (SELECT value::uuid FROM phase2_security_state WHERE key = 'b_trip')) <> 0 THEN
    RAISE EXCEPTION 'A can read B trip';
  END IF;

  UPDATE public.trips SET title = 'forbidden A update'
  WHERE id = (SELECT value::uuid FROM phase2_security_state WHERE key = 'b_trip');
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'A updated B trip'; END IF;

  DELETE FROM public.trips
  WHERE id = (SELECT value::uuid FROM phase2_security_state WHERE key = 'b_trip');
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'A deleted B trip'; END IF;

  BEGIN
    UPDATE public.trips SET owner_id = '2094243874682974210'
    WHERE id = (SELECT value::uuid FROM phase2_security_state WHERE key = 'a_trip');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    NULL;
  END;
  IF EXISTS (
    SELECT 1 FROM public.trips
    WHERE id = (SELECT value::uuid FROM phase2_security_state WHERE key = 'a_trip')
      AND owner_id <> '2094243777574084609'
  ) THEN RAISE EXCEPTION 'A forged owner_id'; END IF;

  BEGIN
    PERFORM public.update_trip_plan(
      (SELECT value::uuid FROM phase2_security_state WHERE key = 'b_trip'),
      'forbidden RPC update', NULL, NULL, 1, 'UTC', 'USD'
    );
    RAISE EXCEPTION 'A business RPC mutated B trip';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;
END;
$assert_private_rls$;

WITH created AS (
  SELECT public.create_share_page_v3(
    (SELECT v.id FROM public.route_variants v
     WHERE v.trip_id = (SELECT value::uuid FROM phase2_security_state WHERE key = 'a_trip')
       AND v.is_primary)
  ) AS page
)
INSERT INTO phase2_security_state (key, value)
SELECT key, value FROM created
CROSS JOIN LATERAL (VALUES
  ('share_id', page ->> 'id'),
  ('share_token', page ->> 'publicToken')
) fields(key, value);

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;

DO $assert_public_snapshot$
DECLARE
  payload jsonb;
BEGIN
  BEGIN
    IF (SELECT count(*) FROM public.trips) <> 0 THEN
      RAISE EXCEPTION 'Anonymous can read private trips';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  payload := public.get_public_share_page_v3(
    (SELECT value::uuid FROM phase2_security_state WHERE key = 'share_token')
  );
  IF payload ->> 'available' <> 'true' OR payload #>> '{trip,title}' <> 'Phase 2 SQL A' THEN
    RAISE EXCEPTION 'Valid public token returned the wrong snapshot';
  END IF;
  payload := public.get_public_share_page_v3('00000000-0000-4000-8000-000000000001');
  IF payload ->> 'available' <> 'false' THEN RAISE EXCEPTION 'Unknown token is available'; END IF;
END;
$assert_public_snapshot$;

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"2094243777574084609","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
SELECT public.revoke_share_page_v1(
  (SELECT value::uuid FROM phase2_security_state WHERE key = 'share_id')
);

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
DO $assert_revoked_snapshot$
DECLARE
  payload jsonb;
BEGIN
  payload := public.get_public_share_page_v3(
    (SELECT value::uuid FROM phase2_security_state WHERE key = 'share_token')
  );
  IF payload ->> 'available' <> 'false' THEN RAISE EXCEPTION 'Revoked token is available'; END IF;
END;
$assert_revoked_snapshot$;

RESET ROLE;
ROLLBACK;
