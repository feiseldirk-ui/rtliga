-- RTLiga: sichere WK-Zeitfenster. Nur diese Migration installieren.
-- Keine Abhängigkeit von den Sitzungsentwürfen 017/018.
-- Bestehende ungültige/überlappende Fenster führen zum vollständigen Abbruch.
begin;
create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
set local search_path = pg_catalog, public, extensions;

alter table public.zeitfenster
  add column if not exists start_ts timestamptz,
  add column if not exists ende_ts timestamptz;

create or replace function public.validate_wk_time_window()
returns trigger language plpgsql security invoker
set search_path = '' set timezone = 'Europe/Berlin' as $$
begin
  if new.wettkampf is null or new.wettkampf not between 1 and 9 then
    raise exception 'Wettkampf muss zwischen 1 und 9 liegen.' using errcode = '22023';
  end if;
  if new.saison is null or new.saison !~ '^[0-9]{4}$' then
    raise exception 'Saison muss eine vierstellige Jahreszahl sein.' using errcode = '22023';
  end if;
  new.start := nullif(btrim(new.start), '');
  new.ende := nullif(btrim(new.ende), '');
  if (new.start is null) <> (new.ende is null) then
    raise exception 'Beginn und Ende müssen gemeinsam gesetzt oder entfernt werden.' using errcode = '22023';
  end if;
  -- Alte Ortszeiten ohne Offset: Europe/Berlin. Neue Eingaben: ISO mit Offset.
  new.start_ts := new.start::timestamptz;
  new.ende_ts := new.ende::timestamptz;
  if new.start_ts is not null and
     (not isfinite(new.start_ts) or not isfinite(new.ende_ts) or new.start_ts >= new.ende_ts) then
    raise exception 'Das Ende muss nach dem Beginn liegen; beide Zeiten müssen gültig sein.' using errcode = '22023';
  end if;
  -- Eindeutige UTC-Zeiten auch für bestehende Leser und Kalenderexporte.
  new.start := to_char(new.start_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  new.ende := to_char(new.ende_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  return new;
end;
$$;
revoke all on function public.validate_wk_time_window() from public, anon, authenticated;
drop trigger if exists validate_wk_time_window on public.zeitfenster;
create trigger validate_wk_time_window before insert or update on public.zeitfenster
  for each row execute function public.validate_wk_time_window();

-- Altbestand vollständig prüfen; Fehler werden nicht stillschweigend repariert.
update public.zeitfenster set start = start;
do $$
begin
  if not exists (select 1 from pg_constraint
    where conrelid = 'public.zeitfenster'::regclass and conname = 'zeitfenster_no_overlap') then
    alter table public.zeitfenster add constraint zeitfenster_no_overlap
      exclude using gist (saison with =, tstzrange(start_ts, ende_ts, '[]') with &&)
      where (start_ts is not null and ende_ts is not null);
  end if;
end;
$$;

create or replace function public.admin_save_wk_window(
  p_saison text, p_wettkampf integer, p_start text, p_ende text,
  p_expected jsonb, p_reset boolean default false
) returns jsonb language plpgsql security invoker set search_path = '' set lock_timeout = '5s' as $$
declare
  current_row public.zeitfenster%rowtype;
  saved_row public.zeitfenster%rowtype;
  actual_snapshot jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Nur angemeldete Administratoren dürfen Zeitfenster ändern.' using errcode = '42501';
  end if;
  if p_saison is null or p_saison !~ '^[0-9]{4}$' or
     p_wettkampf is null or p_wettkampf not between 1 and 9 or p_reset is null then
    raise exception 'Saison oder Wettkampf ist ungültig.' using errcode = '22023';
  end if;
  -- Kurze Transaktion: kein konkurrierendes Anlegen/Ändern/Entfernen.
  -- Die Exclusion-Constraint schützt zusätzlich direkte Tabellenzugriffe.
  lock table public.zeitfenster in share row exclusive mode;
  select * into current_row from public.zeitfenster
    where saison = p_saison and wettkampf = p_wettkampf;
  actual_snapshot := case when current_row.id is null then null else
    jsonb_build_object('id', current_row.id, 'start', current_row.start, 'ende', current_row.ende) end;
  if actual_snapshot is distinct from nullif(p_expected, 'null'::jsonb) then
    raise exception 'Der gespeicherte Stand wurde zwischenzeitlich geändert. Bitte neu laden, Änderungen verwerfen und den aktuellen Stand erneut bearbeiten.' using errcode = '40001';
  end if;
  if p_reset then
    if current_row.id is null then
      raise exception 'Für diesen WK ist kein Zeitfenster gespeichert.' using errcode = '22023';
    end if;
    delete from public.zeitfenster where id = current_row.id returning * into saved_row;
    if saved_row.id is null then
      raise exception 'Entfernen wurde nicht bestätigt.' using errcode = '42501';
    end if;
    return jsonb_build_object('wettkampf', p_wettkampf, 'reset', true, 'row', null);
  end if;
  if p_start is null or p_ende is null or
     p_start !~ '[Tt].*([Zz]|[+-][0-9]{2}:[0-9]{2})$' or
     p_ende !~ '[Tt].*([Zz]|[+-][0-9]{2}:[0-9]{2})$' then
    raise exception 'Beginn und Ende müssen vollständige Zeitangaben mit Zeitzone sein.' using errcode = '22023';
  end if;
  if current_row.id is null then
    insert into public.zeitfenster(saison, wettkampf, start, ende)
      values (p_saison, p_wettkampf, p_start, p_ende) returning * into saved_row;
  else
    update public.zeitfenster set start = p_start, ende = p_ende
      where id = current_row.id returning * into saved_row;
  end if;
  if saved_row.id is null then
    raise exception 'Speichern wurde nicht bestätigt.' using errcode = '42501';
  end if;
  return jsonb_build_object('wettkampf', p_wettkampf, 'reset', false, 'row',
    jsonb_build_object('id', saved_row.id, 'saison', saved_row.saison,
      'wettkampf', saved_row.wettkampf, 'start', saved_row.start, 'ende', saved_row.ende));
end;
$$;
revoke all on function public.admin_save_wk_window(text, integer, text, text, jsonb, boolean) from public, anon;
grant execute on function public.admin_save_wk_window(text, integer, text, text, jsonb, boolean) to authenticated;
notify pgrst, 'reload schema';
commit;
