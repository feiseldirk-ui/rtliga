begin;

-- Öffentliche Terminabfrage für Startseite und Kalenderexport.
-- Anonyme Besucher erhalten ausschließlich Saison, WK-Nummer, Beginn und Ende.
-- Die geschützte Basistabelle und alle übrigen Spalten bleiben unveröffentlicht.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

drop function if exists public.get_public_wk_time_windows(text);
drop function if exists public.get_public_wk_time_windows(integer);
drop function if exists private.get_public_wk_time_windows_internal(integer);

create function private.get_public_wk_time_windows_internal(p_saison integer default null)
returns table (
  saison integer,
  wettkampf integer,
  start text,
  ende text
)
language sql
stable
security definer
set search_path = ''
as $$
  with parameter as (
    select coalesce(
      p_saison,
      pg_catalog.date_part('year', pg_catalog.now())::integer
    ) as saison
  )
  select distinct on (z.wettkampf::integer)
    p.saison,
    z.wettkampf::integer,
    z.start::text,
    z.ende::text
  from public.zeitfenster z
  cross join parameter p
  where coalesce(
      nullif(z.saison::text, ''),
      p.saison::text
    ) = p.saison::text
    and z.wettkampf::integer between 1 and 9
  order by
    z.wettkampf::integer,
    case
      when nullif(z.saison::text, '') = p.saison::text then 0
      else 1
    end;
$$;

revoke all on function private.get_public_wk_time_windows_internal(integer) from public, anon, authenticated;
grant execute on function private.get_public_wk_time_windows_internal(integer) to anon, authenticated;

create function public.get_public_wk_time_windows(p_saison integer default null)
returns table (
  saison integer,
  wettkampf integer,
  start text,
  ende text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from private.get_public_wk_time_windows_internal(p_saison);
$$;

revoke all on function public.get_public_wk_time_windows(integer) from public, anon, authenticated;
grant execute on function public.get_public_wk_time_windows(integer) to anon, authenticated;

comment on function public.get_public_wk_time_windows(integer) is
  'Read-only public projection for WK time windows. Returns only season, competition number, start and end.';

commit;
