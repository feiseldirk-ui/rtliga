create table if not exists public.saisons (
  jahr integer primary key,
  status text not null default 'aktiv',
  created_at timestamptz not null default now(),
  prepared_at timestamptz,
  activated_at timestamptz,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists saisons_status_idx on public.saisons (status);

alter table public.saisons enable row level security;

drop policy if exists "Admins can read saisons" on public.saisons;
drop policy if exists "Admins can write saisons" on public.saisons;

create policy "Admins can read saisons"
on public.saisons
for select
to authenticated
using (public.is_admin());

create policy "Admins can write saisons"
on public.saisons
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

alter table public.verein_ergebnisse add column if not exists saison integer;
alter table public.verein_teilnehmer add column if not exists saison integer;
alter table public.zeitfenster add column if not exists saison integer;

create index if not exists verein_ergebnisse_saison_idx on public.verein_ergebnisse (saison);
create index if not exists verein_teilnehmer_saison_idx on public.verein_teilnehmer (saison);
create index if not exists zeitfenster_saison_idx on public.zeitfenster (saison);

alter table public.zeitfenster drop constraint if exists zeitfenster_wettkampf_key;
drop index if exists public.zeitfenster_wettkampf_key;
create unique index if not exists zeitfenster_saison_wettkampf_key
  on public.zeitfenster (saison, wettkampf)
  where saison is not null;

alter table public.verein_ergebnisse drop constraint if exists verein_ergebnisse_verein_vorname_nachname_altersklasse_wettkampf_key;
drop index if exists public.verein_ergebnisse_verein_vorname_nachname_altersklasse_wettkampf_key;
create unique index if not exists verein_ergebnisse_saison_unique
  on public.verein_ergebnisse (saison, verein, vorname, nachname, altersklasse, wettkampf)
  where saison is not null;

create or replace function public.prepare_next_season(p_current_season integer, p_next_season integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  copied_participants integer := 0;
  inserted_windows integer := 0;
  copied_layouts integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Nur Admins dürfen den Saisonwechsel ausführen.';
  end if;

  if p_next_season is null or p_current_season is null or p_next_season <= p_current_season then
    raise exception 'Ungültige Saisonwerte.';
  end if;

  update public.verein_ergebnisse set saison = p_current_season where saison is null;
  update public.verein_teilnehmer set saison = p_current_season where saison is null;
  update public.zeitfenster set saison = p_current_season where saison is null;

  insert into public.saisons (jahr, status, created_by, archived_at)
  values (p_current_season, 'archiviert', auth.uid(), now())
  on conflict (jahr) do update
    set status = 'archiviert', archived_at = now();

  insert into public.saisons (jahr, status, created_by, prepared_at, activated_at)
  values (p_next_season, 'aktiv', auth.uid(), now(), now())
  on conflict (jahr) do update
    set status = 'aktiv', prepared_at = now(), activated_at = now();

  insert into public.verein_teilnehmer (vorname, name, altersklasse, verein_id, saison)
  select t.vorname, t.name, t.altersklasse, t.verein_id, p_next_season
  from public.verein_teilnehmer t
  where coalesce(t.saison, p_current_season) = p_current_season
    and not exists (
      select 1
      from public.verein_teilnehmer existing
      where existing.verein_id = t.verein_id
        and existing.vorname = t.vorname
        and existing.name = t.name
        and existing.altersklasse is not distinct from t.altersklasse
        and coalesce(existing.saison, p_next_season) = p_next_season
    );
  get diagnostics copied_participants = row_count;

  insert into public.zeitfenster (wettkampf, start, ende, saison)
  select gs.wettkampf, null, null, p_next_season
  from generate_series(1, 9) as gs(wettkampf)
  where not exists (
    select 1 from public.zeitfenster z
    where z.wettkampf = gs.wettkampf and coalesce(z.saison, p_next_season) = p_next_season
  );
  get diagnostics inserted_windows = row_count;

  insert into public.pdf_layout_settings (season, layout_key, settings_json, updated_by)
  select
    p_next_season::text,
    pls.layout_key,
    jsonb_set(coalesce(pls.settings_json, '{}'::jsonb), '{activeSeason}', to_jsonb(p_next_season)),
    auth.uid()
  from public.pdf_layout_settings pls
  where pls.season = p_current_season::text
  on conflict (season, layout_key) do update
    set settings_json = excluded.settings_json,
        updated_by = excluded.updated_by,
        updated_at = now();
  get diagnostics copied_layouts = row_count;

  return jsonb_build_object(
    'current_season', p_current_season,
    'next_season', p_next_season,
    'copied_participants', copied_participants,
    'inserted_windows', inserted_windows,
    'copied_layouts', copied_layouts
  );
end;
$$;

grant execute on function public.prepare_next_season(integer, integer) to authenticated;
