CREATE OR REPLACE FUNCTION app_private.collaboration_user_label(target_user_id text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(
    nullif(btrim(account.email), ''),
    nullif(btrim(account.phone), ''),
    nullif(btrim(account.raw_user_meta_data ->> 'username'), '')
  )
  FROM auth.users account
  WHERE account.id::text = target_user_id;
$$;

UPDATE public.trip_history history
SET actor_label_snapshot = app_private.collaboration_user_label(history.actor_user_id)
WHERE app_private.collaboration_user_label(history.actor_user_id) IS NOT NULL
  AND history.actor_label_snapshot IS DISTINCT FROM
    app_private.collaboration_user_label(history.actor_user_id);
