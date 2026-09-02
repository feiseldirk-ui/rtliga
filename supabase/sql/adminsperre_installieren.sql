-- RTLiga / Onlineliga. Manuelles Installationsskript, keine CLI-Migration.
-- NUR im Wartungsfenster: alte Admin-Clients verlieren Schreibzugriff.
-- Voraussetzung: Vereinssperre v2. Kein Datenreset. Zuerst Anleitung lesen.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $$
begin
  if to_regprocedure('rtliga_session_private.verified_session_id()') is null then
    raise exception 'Vereinssperre v2 fehlt. Installation abgebrochen.';
  end if;
  if to_regnamespace('rtliga_admin_private') is not null then
    raise exception 'Admin-Sitzungsschema existiert bereits. Nicht erneut installieren; zuerst prüfen.';
  end if;
  if (select md5(prosrc) from pg_proc where oid='public.is_admin()'::regprocedure)
       is distinct from 'd1419807f9d30986b16086c05cef899a'
    or (select md5(prosrc) from pg_proc where oid='public.is_admin_user()'::regprocedure)
       is distinct from 'a269da0f9fe7b1fbad7ff19dd7016dd8' then
    raise exception 'Admin-Rechte wurden geändert. Erst vergleichen, nichts überschreiben.';
  end if;
  if (select array_agg(c.relname::text order by c.relname) from pg_class c
      join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p'))
     is distinct from array['admins','ergebnisse','pdf_layout_settings','saisons','verein_ergebnisse','verein_teilnehmer','vereine','zeitfenster'] then
    raise exception 'Tabellenbestand geändert. Schreibschutz zuerst prüfen.';
  end if;
end $$;

create schema rtliga_admin_private;
comment on schema rtliga_admin_private is 'RTLiga admin session lease v1';
revoke all on schema rtliga_admin_private from public,anon,authenticated;
grant usage on schema rtliga_admin_private to authenticated;
create table rtliga_admin_private.original_functions(name text primary key, definition text not null);
insert into rtliga_admin_private.original_functions
 select p.proname, pg_get_functiondef(p.oid) from pg_proc p
 where p.oid in ('public.is_admin()'::regprocedure,'public.is_admin_user()'::regprocedure);
create table rtliga_admin_private.leases(
 user_id uuid primary key, session_id uuid, expires_at timestamptz not null default '-infinity'
);
create table rtliga_admin_private.used_sessions(
 session_id uuid primary key, user_id uuid not null, accepted_at timestamptz not null default clock_timestamp()
);
alter table rtliga_admin_private.leases enable row level security;
alter table rtliga_admin_private.used_sessions enable row level security;
alter table rtliga_admin_private.original_functions enable row level security;
revoke all on all tables in schema rtliga_admin_private from public,anon,authenticated;

-- These private DEFINER helpers need access to protected role/session ledgers.
-- They never trust user_metadata or caller-supplied user/session IDs.
create function rtliga_admin_private.member()
returns boolean language sql security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.admins a
   where a.user_id=auth.uid() and coalesce(a.role,'')='admin');
$$;
create function rtliga_admin_private.active()
returns boolean language sql security definer set search_path='' as $$
 select rtliga_admin_private.member() and exists(
   select 1 from rtliga_admin_private.leases l where l.user_id=auth.uid()
    and l.session_id=rtliga_session_private.verified_session_id()
    and l.expires_at>clock_timestamp());
$$;
revoke all on function rtliga_admin_private.member(),rtliga_admin_private.active() from public,anon,authenticated;

create function rtliga_admin_private.manage(p_action text)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare sid uuid; lease rtliga_admin_private.leases%rowtype;
 answer jsonb := jsonb_build_object('api_version',1,'action',p_action,'allowed',false,'reason','ended');
begin
 if p_action is null or p_action not in ('acquire','renew','release') then
   raise exception 'Unzulässige Sitzungsaktion' using errcode='22023';
 end if;
 sid:=rtliga_session_private.verified_session_id();
 if sid is null then return answer; end if;
 if not rtliga_admin_private.member() and p_action<>'release' then
   return answer||jsonb_build_object('reason','not_admin');
 end if;
 if p_action='acquire' then
   insert into rtliga_admin_private.leases(user_id) values(auth.uid()) on conflict(user_id) do nothing;
 end if;
 select * into lease from rtliga_admin_private.leases where user_id=auth.uid() for update;
 if not found or rtliga_session_private.verified_session_id() is distinct from sid then return answer; end if;
 if p_action='release' then
   if lease.session_id is distinct from sid then return answer; end if;
   update rtliga_admin_private.leases set expires_at='-infinity' where user_id=auth.uid();
   return answer||jsonb_build_object('allowed',true,'reason',null);
 end if;
 if not rtliga_admin_private.member() then return answer; end if;
 if lease.session_id=sid and lease.expires_at>clock_timestamp() then
   update rtliga_admin_private.leases set expires_at=clock_timestamp()+interval '10 minutes' where user_id=auth.uid();
   return answer||jsonb_build_object('allowed',true,'reason',null,'lease_ms',600000);
 end if;
 if p_action='renew' or exists(select 1 from rtliga_admin_private.used_sessions where session_id=sid) then return answer; end if;
 if lease.expires_at>clock_timestamp() and exists(select 1 from auth.sessions s
    where s.id=lease.session_id and s.user_id=auth.uid() and (s.not_after is null or s.not_after>clock_timestamp())) then
   return answer||jsonb_build_object('reason','busy');
 end if;
 insert into rtliga_admin_private.used_sessions(session_id,user_id) values(sid,auth.uid()) on conflict do nothing;
 if not found then return answer; end if;
 update rtliga_admin_private.leases set session_id=sid,expires_at=clock_timestamp()+interval '10 minutes' where user_id=auth.uid();
 return answer||jsonb_build_object('allowed',true,'reason',null,'lease_ms',600000);
end $$;
revoke all on function rtliga_admin_private.manage(text) from public,anon,authenticated;
grant execute on function rtliga_admin_private.manage(text) to authenticated;
create function public.rtliga_admin_session_v1(p_action text)
returns jsonb language sql security invoker set search_path='' as $$
 select rtliga_admin_private.manage(p_action);
$$;
revoke all on function public.rtliga_admin_session_v1(text) from public,anon,authenticated;
grant execute on function public.rtliga_admin_session_v1(text) to authenticated;

-- Replace in place: retain OIDs, grants and policy dependencies. Do not rename!
create or replace function public.is_admin()
returns boolean language sql volatile security definer set search_path='' as $$
 select rtliga_admin_private.active();
$$;
create or replace function public.is_admin_user()
returns boolean language sql volatile security definer set search_path='' as $$
 select rtliga_admin_private.active();
$$;

-- Statement guard also covers legacy SECURITY DEFINER RPCs that check the
-- admins table directly. Lock the lease BEFORE row writes, retain until commit.
create function rtliga_admin_private.guard_write()
returns trigger language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare lease rtliga_admin_private.leases%rowtype; sid uuid;
begin
 if coalesce(auth.jwt()->>'role'='service_role',false) then return null; end if;
 if not rtliga_admin_private.member() then return null; end if;
 sid:=rtliga_session_private.verified_session_id();
 select * into lease from rtliga_admin_private.leases where user_id=auth.uid() for update;
 if not found or sid is null or lease.session_id is distinct from sid
   or lease.expires_at<=clock_timestamp()
   or rtliga_session_private.verified_session_id() is distinct from sid
   or not rtliga_admin_private.member() then
   raise exception 'Admin-Sitzung nicht mehr aktiv. Nicht gespeichert. Bitte erneut anmelden.' using errcode='PT401';
 end if;
 return null;
end $$;
revoke all on function rtliga_admin_private.guard_write() from public,anon,authenticated;
do $$
declare t text;
begin
 foreach t in array array['admins','ergebnisse','pdf_layout_settings','saisons','verein_ergebnisse','verein_teilnehmer','vereine','zeitfenster'] loop
   execute format('create trigger rtliga_admin_session_guard before insert or update or delete or truncate on public.%I for each statement execute function rtliga_admin_private.guard_write()',t);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
