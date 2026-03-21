begin;

create or replace function public.list_admins()
returns table (
  user_id uuid,
  email text,
  role text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Nur Admins dürfen die Adminliste laden.';
  end if;

  return query
  select a.user_id, lower(trim(coalesce(a.email, ''))) as email, coalesce(a.role, 'admin') as role
  from public.admins a
  order by lower(trim(coalesce(a.email, ''))), a.user_id;
end;
$$;

grant execute on function public.list_admins() to authenticated;

create or replace function public.add_admin_by_email(p_email text)
returns table (
  user_id uuid,
  email text,
  role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user auth.users%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Nur Admins dürfen weitere Admins hinzufügen.';
  end if;

  if v_email = '' then
    raise exception 'Bitte eine gültige E-Mail-Adresse angeben.';
  end if;

  select *
    into v_user
  from auth.users u
  where lower(trim(coalesce(u.email, ''))) = v_email
  limit 1;

  if v_user.id is null then
    raise exception 'Kein bestehender Auth-Benutzer mit dieser E-Mail gefunden.';
  end if;

  insert into public.admins (user_id, email, role)
  values (v_user.id, v_email, 'admin')
  on conflict (user_id) do update
    set email = excluded.email,
        role = 'admin';

  return query
  select a.user_id, lower(trim(coalesce(a.email, ''))) as email, coalesce(a.role, 'admin') as role
  from public.admins a
  where a.user_id = v_user.id;
end;
$$;

grant execute on function public.add_admin_by_email(text) to authenticated;

create or replace function public.remove_admin(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_count integer;
begin
  if not public.is_admin() then
    raise exception 'Nur Admins dürfen Admins entfernen.';
  end if;

  if p_user_id is null then
    raise exception 'Ungültige Admin-ID.';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Die aktuell angemeldete Admin-Sitzung kann nicht entfernt werden.';
  end if;

  select count(*)
    into v_existing_count
  from public.admins a
  where a.user_id = p_user_id;

  if v_existing_count = 0 then
    raise exception 'Dieser Admin-Eintrag existiert nicht mehr.';
  end if;

  if (select count(*) from public.admins) <= 1 then
    raise exception 'Mindestens ein Admin muss erhalten bleiben.';
  end if;

  delete from public.admins a
  where a.user_id = p_user_id;
end;
$$;

grant execute on function public.remove_admin(uuid) to authenticated;

commit;
