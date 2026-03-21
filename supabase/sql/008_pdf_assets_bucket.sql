insert into storage.buckets (id, name, public)
values ('pdf-assets', 'pdf-assets', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public can read pdf assets" on storage.objects;
drop policy if exists "Admins can upload pdf assets" on storage.objects;
drop policy if exists "Admins can update pdf assets" on storage.objects;
drop policy if exists "Admins can delete pdf assets" on storage.objects;

create policy "Public can read pdf assets"
on storage.objects
for select
to public
using (bucket_id = 'pdf-assets');

create policy "Admins can upload pdf assets"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'pdf-assets' and public.is_admin());

create policy "Admins can update pdf assets"
on storage.objects
for update
to authenticated
using (bucket_id = 'pdf-assets' and public.is_admin())
with check (bucket_id = 'pdf-assets' and public.is_admin());

create policy "Admins can delete pdf assets"
on storage.objects
for delete
to authenticated
using (bucket_id = 'pdf-assets' and public.is_admin());
