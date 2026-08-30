begin;

-- Öffentliche Ergebnisabfrage für die Startseite.
-- Die Basistabellen bleiben durch RLS geschützt. Anonyme Besucher erhalten
-- ausschließlich die hier explizit ausgewählten Felder aus gültigen,
-- bereits beendeten Wettkampfrunden.

drop function if exists public.get_public_closed_results(text);

create function public.get_public_closed_results(p_saison text default null)
returns table (
  saison text,
  wettkampf integer,
  geschlossen_am timestamptz,
  verein text,
  vorname text,
  nachname text,
  altersklasse text,
  s1 integer,
  s2 integer,
  s3 integer,
  s4 integer,
  s5 integer,
  s6 integer,
  ll integer,
  sl integer,
  gesamt integer,
  status text
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with parameter as (
    select coalesce(
      nullif(pg_catalog.btrim(p_saison), ''),
      pg_catalog.date_part('year', pg_catalog.now())::integer::text
    ) as saison
  ),
  sichere_zeitfenster as (
    select
      z.wettkampf,
      coalesce(z.saison, p.saison) as saison,
      case
        when z.start is not null
          and pg_catalog.pg_input_is_valid(z.start, 'timestamp with time zone')
        then z.start::timestamptz
        else null
      end as start_at,
      case
        when z.ende is not null
          and pg_catalog.pg_input_is_valid(z.ende, 'timestamp with time zone')
        then z.ende::timestamptz
        else null
      end as end_at
    from public.zeitfenster z
    cross join parameter p
    where coalesce(z.saison, p.saison) = p.saison
  ),
  geschlossene_zeitfenster as (
    select z.wettkampf, z.saison, z.end_at
    from sichere_zeitfenster z
    where z.start_at is not null
      and z.end_at is not null
      and z.start_at < z.end_at
      and z.end_at < pg_catalog.now()
  )
  select
    coalesce(e.saison, p.saison)::text as saison,
    e.wettkampf::integer,
    z.end_at as geschlossen_am,
    coalesce(e.verein, '')::text as verein,
    coalesce(e.vorname, '')::text as vorname,
    coalesce(e.nachname, '')::text as nachname,
    coalesce(e.altersklasse, 'Ohne Altersklasse')::text as altersklasse,
    coalesce(e.s1, 0)::integer,
    coalesce(e.s2, 0)::integer,
    coalesce(e.s3, 0)::integer,
    coalesce(e.s4, 0)::integer,
    coalesce(e.s5, 0)::integer,
    coalesce(e.s6, 0)::integer,
    coalesce(e.ll, 0)::integer,
    coalesce(e.sl, 0)::integer,
    coalesce(e.gesamt, 0)::integer,
    coalesce(e.status, '')::text as status
  from public.verein_ergebnisse e
  cross join parameter p
  inner join geschlossene_zeitfenster z
    on z.wettkampf = e.wettkampf
    and z.saison = coalesce(e.saison, p.saison)
  where coalesce(e.saison, p.saison) = p.saison
    and (
      coalesce(e.gesamt, 0) > 0
      or nullif(pg_catalog.btrim(coalesce(e.status, '')), '') is not null
    )
  order by e.wettkampf, e.altersklasse, e.nachname, e.vorname, e.verein;
$$;

revoke all on function public.get_public_closed_results(text) from public;
grant execute on function public.get_public_closed_results(text) to anon, authenticated;

comment on function public.get_public_closed_results(text) is
  'Read-only public projection. Returns scored entries only for valid competition windows whose end time is in the past.';

commit;
