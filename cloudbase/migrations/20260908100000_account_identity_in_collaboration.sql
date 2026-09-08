-- Generated CloudBase migration from database/shared/migrations/20260908100000_account_identity_in_collaboration.sql.

-- Edit the shared source and the minimal provider overlay, then rebuild.

BEGIN;

-- Provider overlays replace this private lookup with their auth-directory identity.
CREATE OR REPLACE FUNCTION app_private.collaboration_user_label(target_user_id text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT NULL::text;
$$;

CREATE OR REPLACE FUNCTION app_private.trip_actor_label()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(
    app_private.collaboration_user_label(app_private.collaboration_user_id()),
    nullif(btrim(profile.display_name), ''),
    'Account'
  )
  FROM (SELECT app_private.collaboration_user_id() AS id) actor
  LEFT JOIN public.profiles profile ON profile.id::text = actor.id;
$$;

CREATE OR REPLACE FUNCTION public.list_trip_members(target_trip_id uuid)
RETURNS TABLE (member_id uuid, member_key text, role text, display_label text, joined_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT member.id, member.user_id::text, member.role::text,
    coalesce(
      app_private.collaboration_user_label(member.user_id::text),
      nullif(btrim(profile.display_name), ''),
      'Account'
    ),
    member.created_at
  FROM public.trip_members member
  LEFT JOIN public.profiles profile ON profile.id::text = member.user_id::text
  WHERE member.trip_id = target_trip_id AND public.can_edit_trip(target_trip_id)
  ORDER BY CASE member.role::text WHEN 'owner' THEN 0 ELSE 1 END, member.created_at, member.id;
$$;

REVOKE EXECUTE ON FUNCTION app_private.collaboration_user_label(text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.trip_actor_label()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_trip_members(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_trip_members(uuid) TO authenticated;

-- CloudBase provider overlay.

CREATE OR REPLACE FUNCTION app_private.collaboration_user_label(target_user_id text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT nullif(btrim(account.username), '')
  FROM auth.users account
  WHERE account.sub = target_user_id;
$$;

UPDATE public.trip_history history
SET actor_label_snapshot = app_private.collaboration_user_label(history.actor_user_id)
WHERE app_private.collaboration_user_label(history.actor_user_id) IS NOT NULL
  AND history.actor_label_snapshot IS DISTINCT FROM
    app_private.collaboration_user_label(history.actor_user_id);

-- Generated fail-closed function ACLs. Review rpc-allowlist.json before granting a browser role.
REVOKE EXECUTE ON FUNCTION app_private.collaboration_user_label(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_private.trip_actor_label() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_trip_members(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_trip_members(uuid) TO authenticated;

COMMIT;
