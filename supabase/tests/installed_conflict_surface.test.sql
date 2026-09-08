begin;

create extension if not exists pgtap with schema extensions;
select plan(4);

select ok(
  to_regprocedure('app_private.raise_app_conflict(text,text)') is not null,
  'the conflict boundary helper is installed'
);

select ok(
  (select routine.prosecdef
      and 'search_path=""' = any(coalesce(routine.proconfig, '{}'::text[]))
   from pg_proc routine
   join pg_namespace namespace on namespace.oid = routine.pronamespace
   where namespace.nspname = 'app_private'
     and routine.proname = 'raise_app_conflict'
     and pg_get_function_identity_arguments(routine.oid) =
       'conflict_message text, conflict_detail text'),
  'the conflict helper is SECURITY DEFINER with an empty search_path'
);

select ok(
  not exists (
    select 1
    from pg_proc routine
    join pg_namespace namespace on namespace.oid = routine.pronamespace
    cross join lateral aclexplode(
      coalesce(routine.proacl, acldefault('f', routine.proowner))
    ) grant_entry
    where namespace.nspname = 'app_private'
      and routine.proname = 'raise_app_conflict'
      and grant_entry.privilege_type = 'EXECUTE'
      and grant_entry.grantee in (
        0,
        (select oid from pg_roles where rolname = 'anon'),
        (select oid from pg_roles where rolname = 'authenticated')
      )
  ),
  'browser roles cannot execute the private conflict helper'
);

select is(
  (select count(*)::integer
   from pg_proc routine
   join pg_namespace namespace on namespace.oid = routine.pronamespace
   where namespace.nspname in ('public', 'app_private')
     and routine.prokind = 'f'
     and routine.proname <> 'raise_app_conflict'
     and pg_get_functiondef(routine.oid) ~*
       'errcode[[:space:]]*=[[:space:]]*''40001'''),
  0,
  'installed application functions route optimistic conflicts through the boundary helper'
);

select * from finish();
rollback;
