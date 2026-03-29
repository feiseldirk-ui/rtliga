# RTLiga – CHATGPT HANDOFF (aktueller Prüfstand)

## Projekt
RTLiga Verwaltung (React + Vite + Supabase + GitHub Pages)

## Aktueller Stand
- GitHub Pages Deployment läuft grundsätzlich.
- Frontend-Build funktioniert.
- Vereins- und Adminbereich sind grundsätzlich lauffähig.
- Speichern von Vereinsergebnissen wurde zuletzt intensiv debuggt.

## Wichtigster aktueller Punkt
Die Datei `supabase/sql/014_save_verein_ergebnisse_rpc.sql` war im Stand auf GitHub/ZIP veraltet und muss als **UUID-Version** vorliegen.

### Korrekte Erwartungen an `save_verein_ergebnis`
- `p_verein_id uuid`
- Vergleich gegen `public.vereine.id` als UUID
- `verein_teilnehmer.saison` ist in dieser Datenbank `text`
- deshalb muss der Saisonvergleich lauten:
  - `coalesce(t.saison, p_saison::text) = p_saison::text`

## Wichtige Erkenntnisse aus dem letzten Debugging
### 1. Frontend-RPC-Aufruf
Datei:
- `src/features/verein/components/VereinErgebnisseEintragen.jsx`

Wichtiger Fix:
- `p_verein_id: verein.id`
- **nicht** `Number(verein.id)`

### 2. SQL Function Overloads
Während des Debuggings existierten zeitweise zwei Varianten von `save_verein_ergebnis` parallel:
- bigint-Version
- uuid-Version

Das führte zu Fehlern wie:
- `Could not choose the best candidate function between ...`

Wenn das erneut auftritt:
1. bigint-Version gezielt löschen
2. uuid-Version gezielt löschen
3. nur die richtige uuid-Version neu anlegen

### 3. Saison-Typen
In `public.verein_teilnehmer` ist:
- `verein_id = uuid`
- `saison = text`

Darum darf die Function dort nicht integer direkt gegen text vergleichen.

### 4. ON CONFLICT / Unique Index
Für `public.verein_ergebnisse` wurde ein passender Unique Index benötigt, damit `ON CONFLICT` funktioniert.
Benötigt wurde effektiv ein eindeutiger Schlüssel auf:
- `(saison, verein, vorname, nachname, altersklasse, wettkampf)`

### 5. Altdaten / Testdaten
Es gibt bzw. gab inkonsistente Alt-Testdaten:
- teils `verein_id = NULL` in `public.verein_ergebnisse`
- teils nur stringbasierte Zuordnung über `verein`
- teils neuere Datensätze mit korrekter UUID-Verknüpfung

Das hat Folgeeffekte auf:
- „Meine Ergebnisse“
- Teilnehmer-Sperrstatus (`Protokolliert` / `Änderbar`)
- Anzeige bereits gespeicherter Werte

## Aktuelle Einschätzung
### Was technisch grundsätzlich funktioniert
- neue/saubere Vereine mit sauberer Auth-Verknüpfung
- Ergebnisse können gespeichert werden, wenn Teilnehmer korrekt im Verein existieren
- für Vereine mit konsistenter Datenbasis funktionieren Ergebnislisten sichtbar besser

### Was noch problematisch sein kann
- alte Testvereine / alte Ergebnisdatensätze
- Anzeige „Meine Ergebnisse“ wenn noch nach `verein`-Text statt `verein_id` gearbeitet wird
- Teilnehmerverwaltung kann bei Alt-Daten noch `Änderbar` zeigen, obwohl Ergebnisse existieren

## Empfohlene Datenstrategie
Da das Projekt noch im Testmodus ist, ist die empfohlene saubere Lösung:
1. alte inkonsistente Testvereine löschen
2. alte inkonsistente `verein_ergebnisse` löschen
3. Vereine neu anlegen
4. Teilnehmer neu anlegen
5. Ergebnisse neu erfassen

Das ist sauberer als alte und neue Logik weiter zu mischen.

## Dateien, die im nächsten Chat zuerst geprüft werden sollten
- `supabase/sql/014_save_verein_ergebnisse_rpc.sql`
- `src/features/verein/components/VereinErgebnisseEintragen.jsx`
- `src/features/verein/components/VereinErgebnisseAnzeigen.jsx`
- `src/shared/ui/dashboard/TeilnehmerPanel.jsx`
- `CHATGPT_HANDOFF.md`

## Ziel für den nächsten Chat
1. SQL-Datei `014_save_verein_ergebnisse_rpc.sql` final sauber halten
2. prüfen, ob Ergebnisanzeige von stringbasiertem `verein` auf `verein_id` umgestellt werden soll
3. prüfen, ob Teilnehmer-Sperrlogik ebenfalls auf `verein_id` gestützt werden soll
4. danach komplette ZIP zurückgeben

## Arbeitsweise
- immer komplette ZIP zurückgeben
- ZIPs nur mit Datum + Uhrzeit benennen
- keine `node_modules` in ZIP
- möglichst nur minimale, nachvollziehbare Änderungen
- keine riskanten Änderungen an Passwort-Reset/Login/Auth-Konfiguration ohne klaren Bedarf

## Update 2026-03-28 – Rundenprotokoll / PDF

### Durchgeführte Änderungen
- `src/shared/pdf/PdfPreviewPage.jsx`
  - **wichtiger Fix**: Rundenprotokoll-PDF zeigt jetzt korrekt
    - `S1–S6`
    - `LL`
    - `SL`
    - `Gesamt`
  - vorher wurde im Round-Previewpfad fälschlich weiter mit einer 9x-WK-Logik gearbeitet.
  - Tabellen im PDF wurden leicht verdichtet, damit Seiten luftiger und stabiler bleiben.
  - Footer-Datum ist jetzt dynamisch.
  - Seitenzahl (`Seite x / y`) wird jetzt im PDF ausgegeben.
  - Vereins-PDF kann die Vereinsspalte jetzt ausblenden; Admin-PDF behält sie.

- `src/lib/pdfExport.js`
  - Seitenaufteilung für PDF nicht mehr nur grob per alter Gewichtung, sondern über realistischere Höhenabschätzung pro Klassenblock.
  - Standard-Dateinamen für PDF-Exporte enthalten jetzt automatisch Datum/Uhrzeit.

- `src/features/admin/components/RundenprotokollTab.jsx`
  - erkennt Runden mit vorhandenen Ergebnissen.
  - Schalter `Neueste Runde` ergänzt.
  - leere Runden im Dropdown werden als leer markiert.

- `src/features/verein/components/VereinRundenprotokollTab.jsx`
  - wechselt automatisch auf die **neueste geschlossene Runde mit echten Vereinsergebnissen**.
  - Schalter `Neueste Runde` ergänzt.
  - geschlossene Runden ohne Vereinseintrag werden kenntlich gemacht.
  - eigener Leerzustand, falls zwar geschlossene Wettkämpfe existieren, aber für den Verein noch kein Protokoll vorliegt.

### Wichtig für den nächsten Chat
- PDF-Strecke ist jetzt deutlich brauchbarer, aber weitere optische Feinabstimmung bleibt möglich:
  - Spaltenbreiten
  - Kopfbereich / Logo-Luft
  - Klassenanzahl pro Seite
  - evtl. andere Seitenlogik für sehr volle Klassen

### Build-Status
- `npm ci` erfolgreich
- `npm run build` erfolgreich
- Vite meldet weiterhin nur die bekannte Warnung zu Chunkgröße / gemischtem statischen+dynamischen Import von `src/lib/supabase/client.js`

## Update 2026-03-28 – Mobile / Vereinsbereich

### Durchgeführte Änderungen
- `src/shared/ui/dashboard/DashboardShell.jsx`
  - Sticky-Kopfbereich auf kleinen Displays entschlackt.
  - linkes/rechtes Medienfeld wird mobil nicht mehr in ein starres 3-Spalten-Raster gepresst.
  - auf Mobilgeräten werden die Seitenslots unterhalb des Hauptbereichs sauber gestapelt.

- `src/features/verein/components/VereinStart.jsx`
  - Bereichs-Tabs mobil deutlich nutzbarer gemacht.
  - Tabs sind jetzt auf kleinen Displays horizontal scrollbar statt unruhig umzubrechen.
  - kurze Labels auf Handy, volle Labels ab `sm`.
  - Logout-Button mobil auf volle Breite.
  - Sticky-Stats bleiben erhalten, sind aber horizontal toleranter.

- `src/features/verein/components/VereinRundenprotokollTab.jsx`
  - Steuerbereich mobil neu gestapelt.
  - Auswahlfeld und Aktionsbuttons auf kleinen Displays volle Breite.
  - **wichtig:** für Handy gibt es jetzt eine Kartenansicht pro Teilnehmer statt nur breiter Tabelle.
  - Desktop-Tabelle bleibt ab `md` unverändert erhalten.

- `src/features/verein/components/VereinErgebnisseAnzeigen.jsx`
  - Kopfbereich kompakter.
  - Statistikboxen sauber untereinander auf kleinen Screens.
  - WK-Kacheln auf Mobilgeräten kompakter (2 Spalten statt zu dichter 3er/5er Logik).

- `src/index.css`
  - Buttons/Inputs leicht mobiler skaliert.
  - Tabellen-Wrapper mit besserem Touch-Scrolling.
  - globale Tabellen-Minimalbreite etwas entschärft.
  - Scrollbar-Helferklasse ergänzt.

### Wichtige Wirkung
- Vereinsbereich ist auf Handys spürbar besser bedienbar, ohne die bestehende Fachlogik zu ändern.
- Besonders die Rundenprotokolle sind mobil jetzt nicht mehr nur „Desktop mit horizontalem Scroll“, sondern haben eine echte kompakte Darstellung.

### Nicht geändert
- keine Auth-/Login-Logik
- keine Ergebnis-Speicherlogik
- keine Supabase-Struktur
- keine PDF-Fachlogik in diesem Schritt

### Build-Status
- `npm ci` erfolgreich
- `npm run build` erfolgreich
- weiterhin nur bekannte Vite-Warnungen zu Chunkgröße / Importstruktur


## Update 2026-03-28 06:40
- Audio-Kachel im Admin-Header gezielt verkleinert, damit der Header nicht unnötig hoch wirkt.
- Rundenprotokoll-Ladevorgang im Admin robuster gemacht (Timeout + Retry), damit beim Tabwechsel nicht dauerhaft "wird geladen" stehen bleibt.
- PDF-Rundenprotokoll: Zellen auf bessere vertikale Zentrierung angepasst; Namens-/Vereinsspalte leicht verbreitert, Werte-Spalten minimal kompakter.

## Update 2026-03-28 06:xx
- Compact-Media im Admin-Header erneut verschlankt: Audio/Video jetzt als deutlich flachere Kompaktkarten, damit der Sticky-Header vor allem auf kleineren Displays weniger Höhe verbraucht.
- PDF-Editor-Speichern gegen Hänger abgesichert: Supabase-Sync läuft jetzt mit Timeout/Fallback, der Button bleibt nicht dauerhaft auf „Supabase wird aktualisiert…“ stehen.
- Nach dem Speichern löst der Editor jetzt zusätzlich `rtliga-admin-refresh` aus, damit Admin-Tabs ihre Daten robuster neu laden.
- Admin-Rundenprotokoll, Gesamtergebnisse und Vereine reagieren jetzt auch auf `rtliga-admin-refresh`.
- Vereine-Tab bekam zusätzlich robustere Session-/Ladelogik.
- PDF-Rundentabellen weiter nachzentriert: Namen/Vereine im Rundenmodus mittiger ausgerichtet, Zeilenhöhe leicht angehoben.
