# Supabase-Erweiterungen für Archiv & Logo-Upload

Für die jetzt eingebaute Admin-Oberfläche sind diese Datenbank-Erweiterungen sinnvoll, damit Archivierung und Logo-Upload dauerhaft serverseitig gespeichert werden können.

## Empfohlen

### 1. Saison-Tabelle
```sql
create table if not exists public.saisons (
  id bigint generated always as identity primary key,
  jahr integer not null unique,
  status text not null default 'aktiv',
  created_at timestamptz not null default now()
);
```

### 2. Saison-Spalte in Ergebnisdaten
```sql
alter table public.verein_ergebnisse
add column if not exists saison integer;

alter table public.verein_teilnehmer
add column if not exists saison integer;

alter table public.zeitfenster
add column if not exists saison integer;
```

### 3. PDF-/Layout-Einstellungen
```sql
create table if not exists public.pdf_settings (
  id bigint generated always as identity primary key,
  saison integer not null,
  overall_title text,
  round_title text,
  subtitle text,
  left_logo_path text,
  right_logo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 4. Storage-Bucket für Logos
- Bucket: `branding`
- Pfade z. B.:
  - `branding/2026/logo-left.png`
  - `branding/2026/logo-right.png`

## Warum nötig?
Ohne Saison-Spalte würden alte und neue Jahresdaten gemischt werden. Die aktuelle UI speichert die Admin-PDF-Einstellungen lokal im Browser, bis diese Tabellen vorhanden sind.
