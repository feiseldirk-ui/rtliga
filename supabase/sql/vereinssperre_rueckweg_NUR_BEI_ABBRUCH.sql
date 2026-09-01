-- NUR bewusster Rückweg: entfernt die neue Vereinssperre (alter Zustand).
-- Nicht bei normaler Installation ausführen! Danach den vorherigen Quellstand
-- bf898262719da776a954c667fca9a6fe319a4979 wiederherstellen.
-- Teilnehmer, Ergebnisse, Zeitfenster und die Sitzungs-Historie bleiben erhalten.
begin;
set local lock_timeout = '5s';
drop function if exists public.rtliga_club_session_v1(text, uuid);
revoke execute on function rtliga_session_private.manage(text, uuid) from authenticated;
drop trigger if exists rtliga_session_guard on public.verein_teilnehmer;
drop trigger if exists rtliga_session_guard on public.verein_ergebnisse;
drop trigger if exists rtliga_session_guard on public.vereine;
notify pgrst, 'reload schema';
commit;
