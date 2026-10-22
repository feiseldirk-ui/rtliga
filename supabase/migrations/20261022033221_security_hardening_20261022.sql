-- Security hardening for the German RTLiga and the separated international league.
-- All critical validation lives in Postgres so browser-console requests cannot bypass it.

begin;

-- ---------------------------------------------------------------------------
-- German league: validate result values, calculate totals on the server and
-- only accept club submissions while the configured competition window is open.
-- ---------------------------------------------------------------------------

alter table public.verein_ergebnisse
  drop constraint if exists verein_ergebnisse_wettkampf_range,
  drop constraint if exists verein_ergebnisse_series_range,
  drop constraint if exists verein_ergebnisse_totals_match;

alter table public.verein_ergebnisse
  add constraint verein_ergebnisse_wettkampf_range
    check (wettkampf between 1 and 9) not valid,
  add constraint verein_ergebnisse_series_range
    check (
      coalesce(s1, 0) between 0 and 100 and
      coalesce(s2, 0) between 0 and 100 and
      coalesce(s3, 0) between 0 and 100 and
      coalesce(s4, 0) between 0 and 100 and
      coalesce(s5, 0) between 0 and 100 and
      coalesce(s6, 0) between 0 and 100
    ) not valid,
  add constraint verein_ergebnisse_totals_match
    check (
      coalesce(ll, 0) = coalesce(s1, 0) + coalesce(s2, 0) + coalesce(s3, 0) and
      coalesce(sl, 0) = coalesce(s4, 0) + coalesce(s5, 0) + coalesce(s6, 0) and
      coalesce(gesamt, 0) = coalesce(s1, 0) + coalesce(s2, 0) + coalesce(s3, 0) +
                            coalesce(s4, 0) + coalesce(s5, 0) + coalesce(s6, 0)
    ) not valid;

alter table public.verein_ergebnisse validate constraint verein_ergebnisse_wettkampf_range;
alter table public.verein_ergebnisse validate constraint verein_ergebnisse_series_range;
alter table public.verein_ergebnisse validate constraint verein_ergebnisse_totals_match;

create or replace function public.save_verein_ergebnis(
  p_verein_id uuid,
  p_vorname text,
  p_nachname text,
  p_altersklasse text,
  p_wettkampf integer,
  p_s1 integer,
  p_s2 integer,
  p_s3 integer,
  p_s4 integer,
  p_s5 integer,
  p_s6 integer,
  p_ll integer,
  p_sl integer,
  p_gesamt integer,
  p_status text,
  p_ergebnis text,
  p_saison integer
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_verein_name text;
  v_teilnehmer_id bigint;
  v_altersklasse text;
  v_result_id bigint;
  v_ll integer;
  v_sl integer;
  v_gesamt integer;
  v_status text := left(trim(coalesce(p_status, '')), 60);
begin
  if p_wettkampf not between 1 and 9 or p_saison not between 2000 and 2100 then
    raise exception 'Ungültiger Wettkampf oder ungültige Saison.' using errcode = '22023';
  end if;

  if p_s1 not between 0 and 100 or p_s2 not between 0 and 100 or
     p_s3 not between 0 and 100 or p_s4 not between 0 and 100 or
     p_s5 not between 0 and 100 or p_s6 not between 0 and 100 then
    raise exception 'Serienwerte müssen zwischen 0 und 100 liegen.' using errcode = '22023';
  end if;

  select v.vereinsname
    into v_verein_name
  from public.vereine v
  where v.id = p_verein_id
    and (v.user_id = auth.uid() or public.is_admin())
  limit 1;

  if v_verein_name is null then
    raise exception 'Für dieses Konto kann kein Vereinsergebnis gespeichert werden.' using errcode = '42501';
  end if;

  select t.id, t.altersklasse
    into v_teilnehmer_id, v_altersklasse
  from public.verein_teilnehmer t
  where t.verein_id = p_verein_id
    and lower(trim(coalesce(t.vorname, ''))) = lower(trim(coalesce(p_vorname, '')))
    and lower(trim(coalesce(t.name, ''))) = lower(trim(coalesce(p_nachname, '')))
    and coalesce(t.altersklasse, '') = coalesce(p_altersklasse, '')
    and coalesce(t.saison, p_saison::text) = p_saison::text
  limit 1;

  if v_teilnehmer_id is null then
    raise exception 'Teilnehmer gehört nicht zum aktuellen Verein oder zur Saison.' using errcode = '23503';
  end if;

  if lower(trim(coalesce(v_altersklasse, ''))) in ('schüler', 'schueler', 'student')
     and (p_s5 <> 0 or p_s6 <> 0) then
    raise exception 'In der Schülerklasse sind nur vier Serien zulässig.' using errcode = '22023';
  end if;

  if not public.is_admin() and not exists (
    select 1
    from public.zeitfenster z
    where z.saison = p_saison::text
      and z.wettkampf = p_wettkampf
      and z.start_ts is not null
      and z.ende_ts is not null
      and clock_timestamp() between z.start_ts and z.ende_ts
  ) then
    raise exception 'Das Zeitfenster für diesen Wettkampf ist nicht geöffnet.' using errcode = '42501';
  end if;

  v_ll := p_s1 + p_s2 + p_s3;
  v_sl := p_s4 + p_s5 + p_s6;
  v_gesamt := v_ll + v_sl;

  insert into public.verein_ergebnisse (
    verein, vorname, nachname, altersklasse, wettkampf,
    s1, s2, s3, s4, s5, s6, ll, sl, gesamt,
    status, ergebnis, saison, verein_id, teilnehmer_id
  ) values (
    v_verein_name, trim(p_vorname), trim(p_nachname), v_altersklasse, p_wettkampf,
    p_s1, p_s2, p_s3, p_s4, p_s5, p_s6, v_ll, v_sl, v_gesamt,
    v_status,
    format(
      'WK%s: S1=%s, S2=%s, S3=%s, LL=%s, S4=%s, S5=%s, S6=%s, SL=%s, Gesamt=%s, Status=%s',
      p_wettkampf, p_s1, p_s2, p_s3, v_ll, p_s4, p_s5, p_s6, v_sl, v_gesamt, v_status
    ),
    p_saison::text, p_verein_id, v_teilnehmer_id
  )
  on conflict (saison, teilnehmer_id, wettkampf)
  do update set
    verein = excluded.verein,
    vorname = excluded.vorname,
    nachname = excluded.nachname,
    altersklasse = excluded.altersklasse,
    s1 = excluded.s1,
    s2 = excluded.s2,
    s3 = excluded.s3,
    s4 = excluded.s4,
    s5 = excluded.s5,
    s6 = excluded.s6,
    ll = excluded.ll,
    sl = excluded.sl,
    gesamt = excluded.gesamt,
    status = excluded.status,
    ergebnis = excluded.ergebnis,
    verein_id = excluded.verein_id
  returning id into v_result_id;

  return v_result_id;
end;
$$;

-- Results can only be mutated through the validated RPC above or an admin
-- SECURITY DEFINER RPC. RLS remains an additional read boundary.
revoke all on public.verein_ergebnisse from public, anon, authenticated;
grant select on public.verein_ergebnisse to authenticated;

-- Remove broad grants that included TRUNCATE/TRIGGER/REFERENCES. Re-grant only
-- the operations used by the application; RLS continues to scope every row.
revoke all on public.admins, public.vereine, public.verein_teilnehmer,
  public.zeitfenster, public.pdf_layout_settings, public.saisons,
  public.admin_audit_log, public.app_feedback
from public, anon, authenticated;

grant select on public.admins to authenticated;
grant select, insert, update on public.vereine to authenticated;
grant select, insert, update, delete on public.verein_teilnehmer to authenticated;
grant select on public.zeitfenster to authenticated;
grant select, insert, update on public.pdf_layout_settings to authenticated;
grant select on public.saisons to authenticated;
grant select, insert, update on public.app_feedback to authenticated;

-- ---------------------------------------------------------------------------
-- International league: bind leases to a real Supabase Auth session and check
-- the league_id of every changed row (the previous statement trigger selected
-- an arbitrary table row).
-- ---------------------------------------------------------------------------

alter table rtliga_mt_session_private.leases enable row level security;
revoke all on schema rtliga_mt_session_private from public, anon, authenticated;
revoke all on all tables in schema rtliga_mt_session_private from public, anon, authenticated;

create or replace function rtliga_mt_session_private.verified_session_id()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
begin
  if auth.uid() is null or auth.jwt()->>'role' is distinct from 'authenticated' then
    return null;
  end if;

  begin
    v_session_id := nullif(auth.jwt()->>'session_id', '')::uuid;
  exception when invalid_text_representation then
    return null;
  end;

  if v_session_id is null or not exists (
    select 1
    from auth.sessions s
    where s.id = v_session_id
      and s.user_id = auth.uid()
      and (s.not_after is null or s.not_after > clock_timestamp())
  ) then
    return null;
  end if;

  return v_session_id;
end;
$$;

create or replace function rtliga_mt_session_private.active(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from rtliga_mt_session_private.leases l
    where l.league_id = p_league_id
      and l.user_id = auth.uid()
      and l.session_id = rtliga_mt_session_private.verified_session_id()
      and l.expires_at > clock_timestamp()
  )
  and exists (
    select 1
    from public.mt_memberships m
    where m.league_id = p_league_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.mt_claim_session(p_league_id uuid, p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_verified uuid := rtliga_mt_session_private.verified_session_id();
  v_ok boolean;
begin
  if v_verified is null or p_session_id is distinct from v_verified then
    return false;
  end if;
  if not exists (
    select 1 from public.mt_memberships
    where league_id = p_league_id and user_id = auth.uid()
  ) then
    return false;
  end if;

  insert into rtliga_mt_session_private.leases(league_id,user_id,session_id,expires_at,updated_at)
  values(p_league_id,auth.uid(),v_verified,clock_timestamp()+interval '10 minutes',clock_timestamp())
  on conflict(league_id,user_id) do update
    set session_id=excluded.session_id,
        expires_at=excluded.expires_at,
        updated_at=excluded.updated_at
    where rtliga_mt_session_private.leases.session_id=excluded.session_id
       or rtliga_mt_session_private.leases.expires_at<=clock_timestamp();

  select exists (
    select 1 from rtliga_mt_session_private.leases
    where league_id=p_league_id and user_id=auth.uid()
      and session_id=v_verified and expires_at>clock_timestamp()
  ) into v_ok;
  return v_ok;
end;
$$;

create or replace function public.mt_release_session(p_league_id uuid, p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_verified uuid := rtliga_mt_session_private.verified_session_id();
begin
  if v_verified is null or p_session_id is distinct from v_verified then
    return;
  end if;
  delete from rtliga_mt_session_private.leases
  where league_id=p_league_id and user_id=auth.uid() and session_id=v_verified;
end;
$$;

create or replace function rtliga_mt_session_private.guard_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_league uuid;
begin
  if coalesce(auth.jwt()->>'role','')='service_role' then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;

  v_league := case when tg_op='DELETE' then old.league_id else new.league_id end;
  if v_league is null or not rtliga_mt_session_private.active(v_league) then
    raise exception 'International session not active. Please sign in again.' using errcode='PT401';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'mt_clubs','mt_feedback','mt_participants','mt_pdf_layout_settings','mt_results','mt_rounds'
  ] loop
    execute format('drop trigger if exists mt_session_guard on public.%I', v_table);
    if v_table = 'mt_clubs' then
      execute format(
        'create trigger mt_session_guard before update or delete on public.%I for each row execute function rtliga_mt_session_private.guard_write()',
        v_table
      );
    else
      execute format(
        'create trigger mt_session_guard before insert or update or delete on public.%I for each row execute function rtliga_mt_session_private.guard_write()',
        v_table
      );
    end if;
  end loop;
end;
$$;

create or replace function public.mt_admin_add(p_league_id uuid, p_email text)
returns table(user_id uuid, email text)
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid;
begin
  if not rtliga_mt_private.has_role(p_league_id,'admin')
     or not rtliga_mt_session_private.active(p_league_id) then
    raise exception 'Active admin session required' using errcode='42501';
  end if;
  if length(trim(coalesce(p_email,''))) > 320 then
    raise exception 'Invalid email address' using errcode='22023';
  end if;
  select u.id into v_user from auth.users u
  where lower(u.email)=lower(trim(p_email)) and u.deleted_at is null;
  if v_user is null then raise exception 'Auth user not found'; end if;
  insert into public.mt_memberships(league_id,user_id,role,club_id)
  values(p_league_id,v_user,'admin',null);
  return query select v_user, lower(trim(p_email));
end;
$$;

create or replace function public.mt_admin_remove(p_league_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not rtliga_mt_private.has_role(p_league_id,'admin')
     or not rtliga_mt_session_private.active(p_league_id) then
    raise exception 'Active admin session required' using errcode='42501';
  end if;
  if p_user_id=auth.uid() then raise exception 'Current admin cannot remove itself'; end if;
  if (select count(*) from public.mt_memberships where league_id=p_league_id and role='admin') <= 1 then
    raise exception 'At least one admin is required';
  end if;
  delete from public.mt_memberships
  where league_id=p_league_id and user_id=p_user_id and role='admin';
  return found;
end;
$$;

create or replace function public.mt_start_new_season(p_league_id uuid, p_new_season integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_old_season integer;
begin
  if not rtliga_mt_private.has_role(p_league_id,'admin')
     or not rtliga_mt_session_private.active(p_league_id) then
    raise exception 'Active admin session required' using errcode='42501';
  end if;
  if p_new_season not between 2000 and 2100 then
    raise exception 'Invalid season' using errcode='22023';
  end if;
  select season into v_old_season from public.mt_leagues where id=p_league_id for update;
  if p_new_season <= v_old_season then
    raise exception 'New season must be later than current season';
  end if;
  update public.mt_rounds set status='closed' where league_id=p_league_id and season=v_old_season;
  update public.mt_leagues set season=p_new_season where id=p_league_id;
  insert into public.mt_rounds(league_id,season,round_number,title,status,public_results)
  select p_league_id,p_new_season,n,'Round '||n,'upcoming',false from generate_series(1,9) n
  on conflict (league_id,season,round_number) do nothing;
  insert into public.mt_participants(league_id,club_id,first_name,last_name,category,active,season)
  select league_id,club_id,first_name,last_name,category,active,p_new_season
  from public.mt_participants
  where league_id=p_league_id and season=v_old_season and active
  on conflict do nothing;
end;
$$;

create or replace function public.mt_complete_club_registration(
  p_league_code text, p_name text, p_username text,
  p_country_code text, p_country_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_league uuid;
  v_club uuid;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if length(trim(coalesce(p_name,''))) not between 2 and 160
     or length(trim(coalesce(p_username,''))) not between 2 and 80
     or length(trim(coalesce(p_country_name,''))) not between 2 and 100
     or upper(trim(coalesce(p_country_code,''))) !~ '^[A-Z]{2}$' then
    raise exception 'Invalid club registration data' using errcode='22023';
  end if;
  select id into v_league from public.mt_leagues
  where code=p_league_code and active;
  if v_league is null then raise exception 'League not found'; end if;
  if exists(select 1 from public.mt_memberships where league_id=v_league and user_id=v_user) then
    raise exception 'Account already assigned';
  end if;
  insert into public.mt_clubs(league_id,user_id,name,username,country_code,country_name)
  values(v_league,v_user,trim(p_name),trim(p_username),upper(trim(p_country_code)),trim(p_country_name))
  returning id into v_club;
  insert into public.mt_memberships(league_id,user_id,role,club_id)
  values(v_league,v_user,'club',v_club);
  return v_club;
end;
$$;

-- Public result pages receive only display-safe club fields. Account IDs and
-- usernames are no longer readable without authentication.
drop policy if exists mt_clubs_public_read on public.mt_clubs;
revoke select on public.mt_clubs from anon;

create or replace function public.get_mt_public_clubs(p_ids uuid[])
returns table(id uuid, league_id uuid, name text, country_code text, country_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct c.id,c.league_id,c.name,c.country_code,c.country_name
  from public.mt_clubs c
  join public.mt_results r on r.club_id=c.id and r.league_id=c.league_id
  join public.mt_rounds rd on rd.id=r.round_id and rd.league_id=r.league_id
  where c.active
    and c.id=any(coalesce(p_ids,array[]::uuid[]))
    and rd.public_results
    and ((rd.ends_at is not null and rd.ends_at<=clock_timestamp()) or rd.status='closed');
$$;

drop policy if exists mt_pdf_public_read on public.mt_pdf_layout_settings;
drop policy if exists mt_pdf_member_read on public.mt_pdf_layout_settings;
create policy mt_pdf_member_read on public.mt_pdf_layout_settings
for select to authenticated
using (rtliga_mt_private.has_role(league_id,null));
revoke select on public.mt_pdf_layout_settings from anon;

-- Bound stored input sizes and align the accepted feedback values with the UI.
alter table public.mt_feedback drop constraint if exists mt_feedback_kind_check;
alter table public.mt_feedback drop constraint if exists mt_feedback_status_check;
alter table public.mt_feedback
  add constraint mt_feedback_kind_check check (kind in ('error','note','suggestion','improvement')),
  add constraint mt_feedback_status_check check (status in ('new','reviewing','planned','done','rejected')),
  add constraint mt_feedback_area_length check (char_length(area) between 1 and 120),
  add constraint mt_feedback_title_length check (char_length(title) between 3 and 120),
  add constraint mt_feedback_description_length check (char_length(description) between 10 and 4000),
  add constraint mt_feedback_admin_note_length check (char_length(admin_note) <= 4000),
  add constraint mt_feedback_screenshot_length check (screenshot_url is null or char_length(screenshot_url) <= 1600000);

alter table public.mt_clubs
  add constraint mt_clubs_name_length check (char_length(name) between 2 and 160),
  add constraint mt_clubs_username_length check (char_length(username) between 2 and 80),
  add constraint mt_clubs_country_name_length check (char_length(country_name) between 2 and 100);

alter table public.mt_participants
  add constraint mt_participants_first_name_length check (char_length(first_name) between 1 and 100),
  add constraint mt_participants_last_name_length check (char_length(last_name) between 1 and 100),
  add constraint mt_participants_category_length check (char_length(category) between 1 and 80);

alter table public.mt_pdf_layout_settings
  add constraint mt_pdf_settings_size check (octet_length(settings_json::text) <= 4000000);

create or replace function rtliga_mt_session_private.validate_result()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.mt_participants p
    where p.id=new.participant_id and p.league_id=new.league_id and p.club_id=new.club_id
      and lower(trim(p.category)) in ('student','schüler','schueler')
  ) and (new.s5<>0 or new.s6<>0) then
    raise exception 'Student class permits four series only' using errcode='22023';
  end if;
  return new;
end;
$$;

drop trigger if exists mt_validate_result on public.mt_results;
create trigger mt_validate_result
before insert or update on public.mt_results
for each row execute function rtliga_mt_session_private.validate_result();

update storage.buckets
set file_size_limit=5242880,
    allowed_mime_types=array['image/png','image/jpeg','image/webp','image/svg+xml']::text[]
where id='pdf-assets';

-- Explicit RPC allowlist. Default function EXECUTE grants are removed so
-- SECURITY DEFINER routines cannot be discovered and called anonymously.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.get_public_closed_results(text),
  public.get_public_wk_time_windows(integer),
  public.get_mt_public_clubs(uuid[])
to anon, authenticated;

grant execute on function public.add_admin_by_email(text),
  public.admin_save_wk_window(text,integer,text,text,jsonb,boolean),
  public.admin_update_teilnehmer_stammdaten(bigint,text,text,text,text),
  public.admin_update_verein_stammdaten(uuid,text,text),
  public.current_verein_id(),
  public.is_admin(),
  public.is_admin_user(),
  public.list_admin_audit_log(integer),
  public.list_admins(),
  public.prepare_next_season(text,text),
  public.remove_admin(uuid),
  public.rtliga_admin_session_v1(text),
  public.rtliga_club_session_v1(text,uuid),
  public.save_verein_ergebnis(uuid,text,text,text,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,text,text,integer),
  public.mt_admin_add(uuid,text),
  public.mt_admin_remove(uuid,uuid),
  public.mt_claim_session(uuid,uuid),
  public.mt_complete_club_registration(text,text,text,text,text),
  public.mt_release_session(uuid,uuid),
  public.mt_start_new_season(uuid,integer)
to authenticated;

notify pgrst,'reload schema';
commit;
