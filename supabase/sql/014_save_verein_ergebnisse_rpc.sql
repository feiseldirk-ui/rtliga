begin;

drop function if exists public.save_verein_ergebnis(
  bigint,
  text,
  text,
  text,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  text,
  text,
  integer
);

drop function if exists public.save_verein_ergebnis(
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  text,
  text,
  integer
);

create function public.save_verein_ergebnis(
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
set search_path = public
as $$
declare
  v_verein_name text;
  v_result_id bigint;
begin
  select v.vereinsname
    into v_verein_name
  from public.vereine v
  where v.id = p_verein_id
    and (
      v.user_id = auth.uid()
      or public.is_admin()
    )
  limit 1;

  if v_verein_name is null then
    raise exception 'Für dieses Konto kann kein Vereinsergebnis gespeichert werden.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.verein_teilnehmer t
    where t.verein_id = p_verein_id
      and t.vorname = p_vorname
      and t.name = p_nachname
      and coalesce(t.altersklasse, '') = coalesce(p_altersklasse, '')
      and coalesce(t.saison, p_saison::text) = p_saison::text
  ) then
    raise exception 'Teilnehmer gehört nicht zum aktuellen Verein oder zur Saison.' using errcode = '23503';
  end if;

  insert into public.verein_ergebnisse (
    verein,
    vorname,
    nachname,
    altersklasse,
    wettkampf,
    s1,
    s2,
    s3,
    s4,
    s5,
    s6,
    ll,
    sl,
    gesamt,
    status,
    ergebnis,
    saison,
    verein_id
  )
  values (
    v_verein_name,
    p_vorname,
    p_nachname,
    p_altersklasse,
    p_wettkampf,
    p_s1,
    p_s2,
    p_s3,
    p_s4,
    p_s5,
    p_s6,
    p_ll,
    p_sl,
    p_gesamt,
    coalesce(p_status, ''),
    coalesce(p_ergebnis, ''),
    p_saison,
    p_verein_id
  )
  on conflict (saison, verein, vorname, nachname, altersklasse, wettkampf)
  do update set
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

grant execute on function public.save_verein_ergebnis(
  uuid,
  text,
  text,
  text,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  text,
  text,
  integer
) to authenticated;

create unique index if not exists verein_ergebnisse_unique_idx
on public.verein_ergebnisse (
  saison,
  verein,
  vorname,
  nachname,
  altersklasse,
  wettkampf
);

commit;
