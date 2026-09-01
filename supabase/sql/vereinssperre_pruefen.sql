-- Nur lesende Installationskontrolle. Nach der Installation ausführen.
select
  to_regprocedure('public.rtliga_club_session_v1(text,uuid)') is not null as rpc_vorhanden,
  (select not prosecdef from pg_proc where oid=to_regprocedure('public.rtliga_club_session_v1(text,uuid)')) as rpc_security_invoker,
  (select count(*) = 3 from pg_trigger where tgname='rtliga_session_guard' and tgenabled='O'
    and tgrelid in ('public.vereine'::regclass,'public.verein_teilnehmer'::regclass,'public.verein_ergebnisse'::regclass)) as drei_schreibschutz_trigger,
  (select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='rtliga_session_private' and c.relkind='r') as interne_tabellen_rls,
  has_function_privilege('authenticated','public.rtliga_club_session_v1(text,uuid)','EXECUTE') as anmeldung_darf_rpc,
  not has_function_privilege('anon','public.rtliga_club_session_v1(text,uuid)','EXECUTE') as anonym_gesperrt,
  not has_table_privilege('authenticated','rtliga_session_private.club_leases','INSERT,UPDATE,DELETE') as direkte_sperraenderung_gesperrt;
