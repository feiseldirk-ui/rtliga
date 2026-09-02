-- Nur beim bewussten Abbruch: hebt Admin-Einzelanmeldung auf, Vereine bleiben gesperrt.
-- Danach die gesicherte App-Version c8eb6a2 wiederherstellen.
-- Private Sitzungsverläufe bleiben als Rückverfolgung erhalten.
begin;
set local lock_timeout='5s';
do $$
declare r record; t text;
begin
 if obj_description(to_regnamespace('rtliga_admin_private'),'pg_namespace')
   is distinct from 'RTLiga admin session lease v1' then raise exception 'Unbekanntes Admin-Schema'; end if;
 if (select count(*) from rtliga_admin_private.original_functions)<>2 then raise exception 'Originalfunktionen fehlen'; end if;
 foreach t in array array['admins','ergebnisse','pdf_layout_settings','saisons','verein_ergebnisse','verein_teilnehmer','vereine','zeitfenster'] loop
   execute format('drop trigger if exists rtliga_admin_session_guard on public.%I',t);
 end loop;
 for r in select definition from rtliga_admin_private.original_functions loop execute r.definition; end loop;
end $$;
revoke all on function public.rtliga_admin_session_v1(text),rtliga_admin_private.manage(text) from authenticated;
notify pgrst,'reload schema';
commit;
