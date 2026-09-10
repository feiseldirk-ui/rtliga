begin;

alter table public.verein_ergebnisse
  add column if not exists teilnehmer_id bigint;

-- Vorhandene Ergebnisse nur dann automatisch zuordnen, wenn genau ein Teilnehmer passt.
with candidates as (
  select
    e.id as ergebnis_id,
    min(t.id) as teilnehmer_id,
    count(*) as treffer
  from public.verein_ergebnisse e
  join public.verein_teilnehmer t
    on t.verein_id = e.verein_id
   and t.vorname = e.vorname
   and t.name = e.nachname
   and coalesce(t.altersklasse, '') = coalesce(e.altersklasse, '')
   and coalesce(t.saison::text, e.saison::text) = e.saison::text
  where e.teilnehmer_id is null
  group by e.id
)
update public.verein_ergebnisse e
set teilnehmer_id = c.teilnehmer_id
from candidates c
where e.id = c.ergebnis_id
  and c.treffer = 1;

create index if not exists verein_ergebnisse_teilnehmer_id_idx
  on public.verein_ergebnisse (teilnehmer_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'verein_ergebnisse_teilnehmer_id_fkey'
      and conrelid = 'public.verein_ergebnisse'::regclass
  ) then
    alter table public.verein_ergebnisse
      add constraint verein_ergebnisse_teilnehmer_id_fkey
      foreign key (teilnehmer_id)
      references public.verein_teilnehmer(id)
      on update cascade
      on delete restrict;
  end if;
end $$;

create or replace function public.admin_update_teilnehmer_stammdaten(
  p_teilnehmer_id bigint,
  p_vorname text,
  p_nachname text,
  p_altersklasse text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vorname text := btrim(coalesce(p_vorname, ''));
  v_nachname text := btrim(coalesce(p_nachname, ''));
  v_altersklasse text := btrim(coalesce(p_altersklasse, ''));
  v_verein_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Nur Administratoren dürfen Teilnehmerdaten korrigieren.' using errcode = '42501';
  end if;

  if v_vorname = '' or v_nachname = '' or v_altersklasse = '' then
    raise exception 'Vorname, Nachname und Altersklasse müssen ausgefüllt sein.' using errcode = '22023';
  end if;

  select verein_id
    into v_verein_id
  from public.verein_teilnehmer
  where id = p_teilnehmer_id
  for update;

  if v_verein_id is null then
    raise exception 'Teilnehmer wurde nicht gefunden.' using errcode = 'P0002';
  end if;

  update public.verein_teilnehmer
  set vorname = v_vorname,
      name = v_nachname,
      altersklasse = v_altersklasse
  where id = p_teilnehmer_id;

  update public.verein_ergebnisse
  set vorname = v_vorname,
      nachname = v_nachname,
      altersklasse = v_altersklasse
  where teilnehmer_id = p_teilnehmer_id;
end;
$$;

grant execute on function public.admin_update_teilnehmer_stammdaten(bigint, text, text, text)
  to authenticated;

commit;
