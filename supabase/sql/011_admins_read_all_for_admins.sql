begin;

drop policy if exists "admins_select_self_only" on public.admins;
drop policy if exists "admins_select_self_or_admin" on public.admins;

create policy "admins_select_self_or_admin"
on public.admins
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin()
);

commit;
