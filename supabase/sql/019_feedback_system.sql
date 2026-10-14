begin;

create table if not exists public.app_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reporter_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  verein_id uuid not null references public.vereine(id) on delete cascade,
  category text not null check (category in ('fehler', 'verbesserung', 'hinweis')),
  title text not null check (char_length(title) between 3 and 120),
  description text not null check (char_length(description) between 10 and 4000),
  area text not null default 'Vereinsbereich' check (char_length(area) between 1 and 120),
  screenshot_path text,
  page_url text,
  user_agent text,
  app_version text,
  status text not null default 'neu' check (status in ('neu', 'in_pruefung', 'vorgesehen', 'erledigt', 'abgelehnt')),
  priority text not null default 'normal' check (priority in ('normal', 'hoch', 'dringend')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 4000),
  resolved_at timestamptz
);

create index if not exists app_feedback_created_at_idx on public.app_feedback (created_at desc);
create index if not exists app_feedback_status_idx on public.app_feedback (status, created_at desc);
create index if not exists app_feedback_verein_id_idx on public.app_feedback (verein_id, created_at desc);
create index if not exists app_feedback_reporter_user_id_idx on public.app_feedback (reporter_user_id, created_at desc);

drop trigger if exists app_feedback_set_updated_at on public.app_feedback;
create trigger app_feedback_set_updated_at
before update on public.app_feedback
for each row execute function public.set_updated_at();

alter table public.app_feedback enable row level security;

drop policy if exists "Vereine erstellen eigene Meldungen" on public.app_feedback;
create policy "Vereine erstellen eigene Meldungen"
on public.app_feedback for insert
to authenticated
with check (
  reporter_user_id = (select auth.uid())
  and exists (
    select 1 from public.vereine v
    where v.id = verein_id and v.user_id = (select auth.uid())
  )
);

drop policy if exists "Vereine lesen eigene Meldungen" on public.app_feedback;
create policy "Vereine lesen eigene Meldungen"
on public.app_feedback for select
to authenticated
using (
  reporter_user_id = (select auth.uid())
  or public.is_admin()
);

drop policy if exists "Admins bearbeiten Meldungen" on public.app_feedback;
create policy "Admins bearbeiten Meldungen"
on public.app_feedback for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins löschen Meldungen" on public.app_feedback;
create policy "Admins löschen Meldungen"
on public.app_feedback for delete
to authenticated
using (public.is_admin());

grant select, insert, update, delete on table public.app_feedback to authenticated;
revoke all on table public.app_feedback from anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'feedback-screenshots',
  'feedback-screenshots',
  false,
  8388608,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Vereine laden eigene Feedbackbilder hoch" on storage.objects;
create policy "Vereine laden eigene Feedbackbilder hoch"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'feedback-screenshots'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Meldende und Admins lesen Feedbackbilder" on storage.objects;
create policy "Meldende und Admins lesen Feedbackbilder"
on storage.objects for select
to authenticated
using (
  bucket_id = 'feedback-screenshots'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_admin()
  )
);

drop policy if exists "Meldende entfernen eigene fehlgeschlagene Uploads" on storage.objects;
create policy "Meldende entfernen eigene fehlgeschlagene Uploads"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'feedback-screenshots'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_admin()
  )
);

commit;
