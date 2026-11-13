-- RTLiga: sichere Admin-Zeitfenster-Speicherung nach Rechtehaertung.
-- Die exponierte RPC bleibt SECURITY INVOKER. Der privilegierte Teil liegt im
-- nicht exponierten Admin-Schema und prueft weiterhin aktive Admin-Sitzung.
begin;

create or replace function rtliga_admin_private.save_wk_window(
  p_saison text,
  p_wettkampf integer,
  p_start text,
  p_ende text,
  p_expected jsonb,
  p_reset boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $function$
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

  lock table public.zeitfenster in share row exclusive mode;

  select *
    into current_row
    from public.zeitfenster
   where saison = p_saison
     and wettkampf = p_wettkampf;

  actual_snapshot := case
    when current_row.id is null then null
    else jsonb_build_object(
      'id', current_row.id,
      'start', current_row.start,
      'ende', current_row.ende
    )
  end;

  if actual_snapshot is distinct from nullif(p_expected, 'null'::jsonb) then
    raise exception 'Der gespeicherte Stand wurde zwischenzeitlich geändert. Bitte neu laden, Änderungen verwerfen und den aktuellen Stand erneut bearbeiten.' using errcode = '40001';
  end if;

  if p_reset then
    if current_row.id is null then
      raise exception 'Für diesen WK ist kein Zeitfenster gespeichert.' using errcode = '22023';
    end if;

    delete from public.zeitfenster
     where id = current_row.id
     returning * into saved_row;

    if saved_row.id is null then
      raise exception 'Entfernen wurde nicht bestätigt.' using errcode = '42501';
    end if;

    return jsonb_build_object(
      'wettkampf', p_wettkampf,
      'reset', true,
      'row', null
    );
  end if;

  if p_start is null or p_ende is null or
     p_start !~ '[Tt].*([Zz]|[+-][0-9]{2}:[0-9]{2})$' or
     p_ende !~ '[Tt].*([Zz]|[+-][0-9]{2}:[0-9]{2})$' then
    raise exception 'Beginn und Ende müssen vollständige Zeitangaben mit Zeitzone sein.' using errcode = '22023';
  end if;

  if current_row.id is null then
    insert into public.zeitfenster(saison, wettkampf, start, ende)
    values (p_saison, p_wettkampf, p_start, p_ende)
    returning * into saved_row;
  else
    update public.zeitfenster
       set start = p_start,
           ende = p_ende
     where id = current_row.id
     returning * into saved_row;
  end if;

  if saved_row.id is null then
    raise exception 'Speichern wurde nicht bestätigt.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'wettkampf', p_wettkampf,
    'reset', false,
    'row', jsonb_build_object(
      'id', saved_row.id,
      'saison', saved_row.saison,
      'wettkampf', saved_row.wettkampf,
      'start', saved_row.start,
      'ende', saved_row.ende
    )
  );
end;
$function$;

revoke all on function rtliga_admin_private.save_wk_window(text, integer, text, text, jsonb, boolean) from public, anon;
grant execute on function rtliga_admin_private.save_wk_window(text, integer, text, text, jsonb, boolean) to authenticated, service_role;

create or replace function public.admin_save_wk_window(
  p_saison text,
  p_wettkampf integer,
  p_start text,
  p_ende text,
  p_expected jsonb,
  p_reset boolean default false
)
returns jsonb
language sql
set search_path = ''
as $function$
  select rtliga_admin_private.save_wk_window(
    p_saison,
    p_wettkampf,
    p_start,
    p_ende,
    p_expected,
    p_reset
  );
$function$;

revoke all on function public.admin_save_wk_window(text, integer, text, text, jsonb, boolean) from public, anon;
grant execute on function public.admin_save_wk_window(text, integer, text, text, jsonb, boolean) to authenticated, service_role;

commit;
