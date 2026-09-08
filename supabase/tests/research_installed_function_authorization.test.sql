begin;

create extension if not exists pgtap with schema extensions;
select plan(4);

select ok(
  (select count(*) > 0
   from pg_proc routine
   join pg_namespace namespace on namespace.oid = routine.pronamespace
   where namespace.nspname in ('public', 'app_private')
     and (
       routine.proname like 'apply_research_item_to_variant%'
       or routine.proname like 'revert_research_plan_application%'
       or routine.proname like 'select_research_item_for_variant%'
       or routine.proname like 'apply_selected_research_item%'
     )),
  'the installed Research Apply/Select/Revert function graph is present'
);

select is(
  (select count(*)::integer
   from pg_proc routine
   join pg_namespace namespace on namespace.oid = routine.pronamespace
   where namespace.nspname in ('public', 'app_private')
     and (
       routine.proname like 'apply_research_item_to_variant%'
       or routine.proname like 'revert_research_plan_application%'
       or routine.proname like 'select_research_item_for_variant%'
       or routine.proname like 'apply_selected_research_item%'
     )
     and lower(pg_get_functiondef(routine.oid)) ~
       'trip[.]owner_id[[:space:]]*=[[:space:]]*(current_user_id([[:space:]]*::[[:space:]]*uuid)?|auth[.]uid[[:space:]]*[(][[:space:]]*[)]|app_private[.](current_user_id|app_current_user_id)[[:space:]]*[(][[:space:]]*[)])'),
  0,
  'no installed Research function retains an owner-only trip predicate'
);

select is(
  (select count(*)::integer
   from pg_proc routine
   join pg_namespace namespace on namespace.oid = routine.pronamespace
   where namespace.nspname in ('public', 'app_private')
     and (
       routine.proname like 'apply_research_item_to_variant%'
       or routine.proname like 'revert_research_plan_application%'
       or routine.proname like 'select_research_item_for_variant%'
       or routine.proname like 'apply_selected_research_item%'
     )
     and not routine.prosecdef),
  0,
  'the rewrite preserves SECURITY DEFINER on the installed function graph'
);

select is(
  (select count(*)::integer
   from pg_proc routine
   join pg_namespace namespace on namespace.oid = routine.pronamespace
   where namespace.nspname in ('public', 'app_private')
     and (
       routine.proname like 'apply_research_item_to_variant%'
       or routine.proname like 'revert_research_plan_application%'
       or routine.proname like 'select_research_item_for_variant%'
       or routine.proname like 'apply_selected_research_item%'
     )
     and not ('search_path=""' = any(coalesce(routine.proconfig, '{}'::text[])))),
  0,
  'the rewrite preserves an empty SECURITY DEFINER search_path'
);

select * from finish();
rollback;
