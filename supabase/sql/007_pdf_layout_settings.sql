begin;

create table if not exists public.pdf_layout_settings (
  scope text primary key,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_pdf_layout_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists pdf_layout_settings_set_updated_at on public.pdf_layout_settings;
create trigger pdf_layout_settings_set_updated_at
before update on public.pdf_layout_settings
for each row
execute function public.set_pdf_layout_settings_updated_at();

alter table public.pdf_layout_settings enable row level security;

drop policy if exists "pdf_layout_settings_select_authenticated" on public.pdf_layout_settings;
drop policy if exists "pdf_layout_settings_write_admin_only" on public.pdf_layout_settings;

create policy "pdf_layout_settings_select_authenticated"
on public.pdf_layout_settings
for select
to authenticated
using (true);

create policy "pdf_layout_settings_write_admin_only"
on public.pdf_layout_settings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into public.pdf_layout_settings (scope, settings)
values ('global', '{}'::jsonb)
on conflict (scope) do nothing;

commit;
