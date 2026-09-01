-- RTLiga: Installation im Supabase-SQL-Editor, Projekt Onlineliga.
-- Zuerst Anleitung lesen: Vereins-Schreibzugriffe alter Clients werden gesperrt!
-- Kein Datenreset. Teilnehmer, Ergebnisse und WK-Zeitfenster bleiben erhalten.
-- Manuelles Installationsskript: CLI-Migrationsregistrierung nicht vorgenommen.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
begin
  if to_regclass('public.vereine') is null
     or to_regclass('public.verein_teilnehmer') is null
     or to_regclass('public.verein_ergebnisse') is null
     or to_regclass('auth.sessions') is null
     or to_regprocedure('public.is_admin()') is null then
    raise exception 'RTLiga-Tabellen/Auth fehlen. Installation abgebrochen.';
  end if;
  if to_regnamespace('rtliga_session_private') is not null
     and obj_description(to_regnamespace('rtliga_session_private'), 'pg_namespace')
         is distinct from 'RTLiga club session lease v1' then
    raise exception 'Unbekanntes Sitzungsschema vorhanden. Erst prüfen, nichts überschreiben.';
  end if;
end $$;

create schema if not exists rtliga_session_private;
comment on schema rtliga_session_private is 'RTLiga club session lease v1';
revoke all on schema rtliga_session_private from public, anon, authenticated;
grant usage on schema rtliga_session_private to authenticated;

create table if not exists rtliga_session_private.club_leases (
  verein_id uuid primary key references public.vereine(id) on delete cascade,
  session_id uuid,
  user_id uuid,
  expires_at timestamptz not null default '-infinity',
  check ((session_id is null) = (user_id is null))
);
create table if not exists rtliga_session_private.used_sessions (
  session_id uuid primary key,
  verein_id uuid not null references public.vereine(id) on delete cascade,
  user_id uuid not null,
  accepted_at timestamptz not null default clock_timestamp()
);
create index if not exists used_sessions_club_idx
  on rtliga_session_private.used_sessions(verein_id);
alter table rtliga_session_private.club_leases enable row level security;
alter table rtliga_session_private.used_sessions enable row level security;
revoke all on rtliga_session_private.club_leases,
  rtliga_session_private.used_sessions from public, anon, authenticated;

-- SECURITY DEFINER is narrowly needed to inspect auth.sessions and the private
-- lease ledger. Neither table is readable/writable by clients. Every exposed
-- action validates JWT identity and ownership; the public wrapper is INVOKER.
create or replace function rtliga_session_private.verified_session_id()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  sid uuid;
begin
  if auth.uid() is null or auth.jwt()->>'role' is distinct from 'authenticated' then
    return null;
  end if;
  begin
    sid := nullif(auth.jwt()->>'session_id', '')::uuid;
  exception when invalid_text_representation then return null;
  end;
  if sid is null or not exists (
    select 1 from auth.sessions s
    where s.id = sid and s.user_id = auth.uid()
      and (s.not_after is null or s.not_after > clock_timestamp())
  ) then return null; end if;
  return sid;
end $$;
revoke all on function rtliga_session_private.verified_session_id() from public, anon, authenticated;

create or replace function rtliga_session_private.manage(p_action text, p_verein_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
set lock_timeout = '5s' as $$
declare
  sid uuid;
  lease rtliga_session_private.club_leases%rowtype;
  answer jsonb := jsonb_build_object('api_version', 1, 'action', p_action,
    'verein_id', p_verein_id, 'allowed', false, 'reason', 'ended');
begin
  if p_action is null or p_action not in ('acquire', 'renew', 'release') then
    raise exception 'Unzulässige Sitzungsaktion.' using errcode = '22023';
  end if;
  sid := rtliga_session_private.verified_session_id();
  if sid is null or not exists (
    select 1 from public.vereine v where v.id = p_verein_id and v.user_id = auth.uid()
  ) then return answer; end if;

  -- The PK serializes even two simultaneous first acquisitions. Renew/release
  -- must not create a lease. This row is also locked by every guarded write.
  if p_action = 'acquire' then
    insert into rtliga_session_private.club_leases(verein_id)
    values(p_verein_id) on conflict (verein_id) do nothing;
  end if;
  select * into lease from rtliga_session_private.club_leases
    where verein_id = p_verein_id for update;
  if not found then return answer; end if;
  -- Recheck after waiting for locks: expiry/revocation may have happened.
  if rtliga_session_private.verified_session_id() is distinct from sid
     or not exists (select 1 from public.vereine v where v.id = p_verein_id and v.user_id = auth.uid()) then
    return answer;
  end if;

  if p_action = 'release' then
    if lease.session_id is distinct from sid or lease.user_id is distinct from auth.uid() then
      return answer;
    end if;
    update rtliga_session_private.club_leases set expires_at = '-infinity'
      where verein_id = p_verein_id;
    return answer || jsonb_build_object('allowed', true, 'reason', null);
  end if;

  if lease.session_id = sid and lease.user_id = auth.uid() and lease.expires_at > clock_timestamp() then
    update rtliga_session_private.club_leases set expires_at = clock_timestamp() + interval '10 minutes'
      where verein_id = p_verein_id;
    return answer || jsonb_build_object('allowed', true, 'reason', null, 'lease_ms', 600000);
  end if;

  -- Never revive a released/expired/previously accepted session, even via acquire.
  if p_action = 'renew' or exists (
    select 1 from rtliga_session_private.used_sessions h where h.session_id = sid
  ) then return answer; end if;

  if lease.expires_at > clock_timestamp() and exists (
    select 1 from auth.sessions s where s.id = lease.session_id
      and s.user_id = lease.user_id
      and (s.not_after is null or s.not_after > clock_timestamp())
  ) then return answer || jsonb_build_object('reason', 'busy'); end if;

  -- History is intentionally retained after logout/auth cleanup to reject old JWTs.
  insert into rtliga_session_private.used_sessions(session_id, verein_id, user_id)
    values(sid, p_verein_id, auth.uid()) on conflict(session_id) do nothing;
  if not found then return answer; end if;
  update rtliga_session_private.club_leases
    set session_id = sid, user_id = auth.uid(), expires_at = clock_timestamp() + interval '10 minutes'
    where verein_id = p_verein_id;
  return answer || jsonb_build_object('allowed', true, 'reason', null, 'lease_ms', 600000);
end $$;
revoke all on function rtliga_session_private.manage(text, uuid) from public, anon, authenticated;
grant execute on function rtliga_session_private.manage(text, uuid) to authenticated;

create or replace function public.rtliga_club_session_v1(p_action text, p_verein_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select rtliga_session_private.manage(p_action, p_verein_id);
$$;
revoke all on function public.rtliga_club_session_v1(text, uuid) from public, anon, authenticated;
grant execute on function public.rtliga_club_session_v1(text, uuid) to authenticated;

create or replace function rtliga_session_private.trusted_maintenance()
returns boolean language sql security definer set search_path = '' as $$
  select
    (auth.uid() is not null and public.is_admin())
    or coalesce(auth.jwt()->>'role' = 'service_role', false)
    or (auth.uid() is null and session_user in ('postgres', 'supabase_admin')
      and coalesce(nullif(current_setting('role', true), ''), 'none') in ('none', 'postgres', 'supabase_admin'));
$$;
revoke all on function rtliga_session_private.trusted_maintenance() from public, anon, authenticated;

create or replace function rtliga_session_private.assert_writer(p_verein_id uuid)
returns void language plpgsql security definer set search_path = ''
set lock_timeout = '5s' as $$
declare
  lease rtliga_session_private.club_leases%rowtype;
  sid uuid;
begin
  if rtliga_session_private.trusted_maintenance() then return; end if;
  sid := rtliga_session_private.verified_session_id();
  if sid is null or not exists (
    select 1 from public.vereine v where v.id = p_verein_id and v.user_id = auth.uid()
  ) then
    raise exception 'Vereinssitzung nicht berechtigt. Bitte erneut anmelden.' using errcode = 'PT403';
  end if;
  select * into lease from rtliga_session_private.club_leases
    where verein_id = p_verein_id for update;
  if not found or lease.session_id is distinct from sid or lease.user_id is distinct from auth.uid()
     or lease.expires_at <= clock_timestamp()
     or rtliga_session_private.verified_session_id() is distinct from sid
     or not exists (select 1 from public.vereine v where v.id = p_verein_id and v.user_id = auth.uid()) then
    raise exception 'Vereinssitzung nicht mehr aktiv. Nicht gespeichert. Bitte erneut anmelden.' using errcode = 'PT401';
  end if;
  -- Lease lock stays held through the entire write transaction (also definer RPC).
end $$;
revoke all on function rtliga_session_private.assert_writer(uuid) from public, anon, authenticated;

create or replace function rtliga_session_private.guard_club_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  club_id uuid;
begin
  if not rtliga_session_private.trusted_maintenance() then
    if tg_table_name = 'vereine' then
      if tg_op = 'UPDATE' and (new.id is distinct from old.id or new.user_id is distinct from old.user_id) then
        raise exception 'Vereinszuordnung darf nicht geändert werden.' using errcode = 'PT403';
      end if;
      club_id := old.id;
    else
      if tg_op = 'UPDATE' and new.verein_id is distinct from old.verein_id then
        raise exception 'Vereinszuordnung darf nicht geändert werden.' using errcode = 'PT403';
      end if;
      if tg_op = 'DELETE' then club_id := old.verein_id; else club_id := new.verein_id; end if;
    end if;
    perform rtliga_session_private.assert_writer(club_id);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function rtliga_session_private.guard_club_write() from public, anon, authenticated;

-- A trigger also covers SECURITY DEFINER save_verein_ergebnis(), unlike a new
-- permissive RLS policy. Original ownership policies/grants stay unchanged.
drop trigger if exists rtliga_session_guard on public.verein_teilnehmer;
create trigger rtliga_session_guard before insert or update or delete on public.verein_teilnehmer
  for each row execute function rtliga_session_private.guard_club_write();
drop trigger if exists rtliga_session_guard on public.verein_ergebnisse;
create trigger rtliga_session_guard before insert or update or delete on public.verein_ergebnisse
  for each row execute function rtliga_session_private.guard_club_write();
drop trigger if exists rtliga_session_guard on public.vereine;
create trigger rtliga_session_guard before update or delete on public.vereine
  for each row execute function rtliga_session_private.guard_club_write();

notify pgrst, 'reload schema';
commit;
