begin;

-- 1) Vereinsregistrierung erlauben:
-- Ein eingeloggter Benutzer darf genau seinen eigenen Vereinsdatensatz anlegen.
drop policy if exists "vereine_insert_admin_only" on public.vereine;
drop policy if exists "vereine_insert_self_or_admin" on public.vereine;

create policy "vereine_insert_self_or_admin"
on public.vereine
for insert
to authenticated
with check (
  user_id = auth.uid()
  or public.is_admin()
);

-- 2) Admin-Tabelle verriegeln:
-- Authenticated darf nur die eigene Zeile lesen, aber niemals schreiben.
drop policy if exists "admins_select_own_or_admin" on public.admins;
drop policy if exists "admins_select_self_only" on public.admins;
drop policy if exists "admins_insert_admin_only" on public.admins;
drop policy if exists "admins_update_admin_only" on public.admins;
drop policy if exists "admins_delete_admin_only" on public.admins;

create policy "admins_select_self_only"
on public.admins
for select
to authenticated
using (
  user_id = auth.uid()
);

-- 3) Admin-Mail fest eintragen / aktualisieren.
update public.admins
set email = 'df0776@gmx.de',
    role = 'admin'
where user_id = (
  select id
  from auth.users
  where lower(email) = lower('df0776@gmx.de')
  limit 1
);

insert into public.admins (user_id, email, role)
select u.id, u.email, 'admin'
from auth.users u
where lower(u.email) = lower('df0776@gmx.de')
  and not exists (
    select 1
    from public.admins a
    where a.user_id = u.id
  );

-- 4) Alte Legacy-Admin-Zeilen ohne user_id löschen.
delete from public.admins
where user_id is null;

commit;
