-- Nur lesend. Alle Spalten müssen true zeigen; ersetzt nicht den Gerätetest.
select
 to_regprocedure('public.rtliga_admin_session_v1(text)') is not null as rpc_vorhanden,
 (select not prosecdef from pg_proc where oid=to_regprocedure('public.rtliga_admin_session_v1(text)')) as rpc_invoker,
 (select count(*)=8 from pg_trigger where tgname='rtliga_admin_session_guard' and tgenabled='O'
   and tgfoid=to_regprocedure('rtliga_admin_private.guard_write()')) as acht_schreibschutz_trigger,
 (select count(*)=3 and bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='rtliga_admin_private' and c.relkind='r') as private_tabellen_rls,
 (select count(*)=2 and bool_and(prosrc like '%rtliga_admin_private.active()%') from pg_proc
   where oid in ('public.is_admin()'::regprocedure,'public.is_admin_user()'::regprocedure)) as beide_admin_pruefungen,
 has_function_privilege('authenticated','public.rtliga_admin_session_v1(text)','EXECUTE') as anmeldung_darf_rpc,
 not has_function_privilege('anon','public.rtliga_admin_session_v1(text)','EXECUTE') as anonym_gesperrt,
 not has_table_privilege('authenticated','rtliga_admin_private.leases','INSERT,UPDATE,DELETE,SELECT') as direkte_sperraenderung_gesperrt,
 (select count(*)=3 from pg_trigger where tgname='rtliga_session_guard' and tgenabled='O') as vereinssperre_erhalten;
