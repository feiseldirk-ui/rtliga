begin;

-- Login-Daten bleiben ausdrücklich außen vor.
-- Änderbar ist hier nur der fachliche Vereinsname.
drop function if exists public.admin_update_verein_stammdaten(uuid, text, text, text);

create or replace function public.admin_update_verein_stammdaten(
  p_verein_id uuid,
  p_vereinsname text,
  p_bemerkung text
)
returns public.vereine
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.vereine%rowtype;
  v_row public.vereine%rowtype;
  v_vereinsname text := trim(coalesce(p_vereinsname,''));
  v_bemerkung text := trim(coalesce(p_bemerkung,''));
  v_admin_email text := lower(trim(coalesce(auth.jwt()->>'email','')));
begin
  if not public.is_admin() then
    raise exception 'Nur Admins dürfen Vereinsdaten nachträglich korrigieren.' using errcode = '42501';
  end if;

  if v_vereinsname = '' then
    raise exception 'Der Vereinsname muss ausgefüllt sein.' using errcode = '22023';
  end if;

  if v_bemerkung = '' then
    raise exception 'Bitte eine Bemerkung bzw. den Grund der Änderung angeben.' using errcode = '22023';
  end if;

  select * into v_old
  from public.vereine
  where id = p_verein_id
  for update;

  if not found then
    raise exception 'Verein wurde nicht gefunden.' using errcode = 'P0002';
  end if;

  if coalesce(v_old.vereinsname,'') = v_vereinsname then
    return v_old;
  end if;

  update public.vereine
  set vereinsname = v_vereinsname
  where id = p_verein_id
  returning * into v_row;

  update public.verein_teilnehmer
  set verein = v_vereinsname
  where verein_id = p_verein_id;

  update public.verein_ergebnisse
  set verein = v_vereinsname
  where verein_id = p_verein_id;

  insert into public.admin_audit_log(
    admin_user_id, admin_email, entity_type, entity_id, verein_id,
    field_name, old_value, new_value, bemerkung
  ) values (
    auth.uid(), nullif(v_admin_email,''), 'verein', p_verein_id::text, p_verein_id,
    'Vereinsname', v_old.vereinsname, v_vereinsname, v_bemerkung
  );

  return v_row;
end;
$$;

grant execute on function public.admin_update_verein_stammdaten(uuid, text, text) to authenticated;

create or replace function public.list_admin_audit_log(p_limit integer default 100)
returns table (
  id bigint,
  created_at timestamptz,
  admin_user_id uuid,
  admin_email text,
  entity_type text,
  entity_id text,
  verein_id uuid,
  teilnehmer_id bigint,
  field_name text,
  old_value text,
  new_value text,
  bemerkung text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Nur Admins dürfen den Änderungsverlauf laden.' using errcode = '42501';
  end if;

  return query
  select
    l.id, l.created_at, l.admin_user_id, l.admin_email, l.entity_type,
    l.entity_id, l.verein_id, l.teilnehmer_id, l.field_name,
    l.old_value, l.new_value, l.bemerkung
  from public.admin_audit_log l
  order by l.created_at desc, l.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

grant execute on function public.list_admin_audit_log(integer) to authenticated;

commit;
