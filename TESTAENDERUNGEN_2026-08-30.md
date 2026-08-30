# RTLiga – Teständerungen 2026-08-30

Nur lokaler Teststand. Keine Veröffentlichung, kein Deployment, keine Supabase-Änderung.

## 1. WK-Zeitfenster im Vereinsbereich
- Neuer Button „WK-Zeitfenster“ in der Navigationszeile des Vereinsbereichs.
- Öffnet eine modale Übersicht für WK1 bis WK9.
- Zeigt je Wettkampf Beginn und Ende mit Datum/Uhrzeit.
- Statusanzeige: Offen, Bevorstehend, Geschlossen oder Nicht festgelegt.
- Daten werden aus der bestehenden Tabelle `zeitfenster` für die aktive Saison gelesen.

## 2. Ergebnis-Erfassung entschlackt
- In „Erfassen“ werden innerhalb eines geöffneten Teilnehmers nur noch aktuell offene Wettkampfrunden angezeigt.
- Geschlossene und zukünftige Wettkampfrunden werden dort nicht mehr als Karten dargestellt.
- Wenn aktuell keine Runde offen ist, erscheint stattdessen ein klarer Hinweis auf die WK-Zeitfensterübersicht.
- Bestehende Speicher-, Ergebnis- und Supabase-Logik wurde nicht geändert.

## Prüfung
- Nicht oder unvollständig festgelegte Zeitfenster gelten nicht als offen.
- Der Status Offen/Bevorstehend/Geschlossen aktualisiert sich bei geöffneter Seite minütlich.
- Die Zeitfensterabfrage hat eine Zeitgrenze, damit keine Ladeanzeige dauerhaft hängen bleibt.
- `npm ci`: erfolgreich.
- `npm test`: 5/5 Tests erfolgreich (nicht gesetzt, ungültig, bevorstehend, geschlossen, genau ein offener WK).
- `npm run lint`: erfolgreich.
- `npm run build`: erfolgreich.

## 3. Neue Startseite und öffentliche Ergebnisse
- Startseite nach dem bereitgestellten Entwurf in Vereinsbereich und öffentlichen Bereich aufgeteilt.
- Bestehende Vereinsregistrierung bleibt vorläufig unverändert erreichbar.
- Neuer öffentlicher Bereich ohne Anmeldung mit:
  - Ergebnissen einzelner Wettkampfrunden,
  - aktueller Gesamtrangliste,
  - PDF-Download für Rundenprotokoll und Gesamtliste.
- Öffentlich erscheinen ausschließlich Runden mit einem gültigen Start-/Endzeitfenster, dessen Ende bereits vergangen ist.
- Offene, zukünftige, unvollständige und ungültige Zeitfenster werden serverseitig ausgeschlossen.
- Die geschützten Basistabellen erhalten keine anonyme Lesepolicy. Stattdessen liefert die neue Read-only-RPC `get_public_closed_results` nur die ausdrücklich freigegebenen Ergebnisfelder.
- Leere Ergebnisdatensätze ohne Gesamtwert werden nicht veröffentlicht.

### Zusätzliche Prüfung
- SQL-Auswahlabfrage gegen die bestehende Produktionsstruktur ohne Änderung ausgeführt: derzeit qualifizieren sich nur WK5 und WK7 als gültig geschlossen und mit Ergebnis.
- `npm test`: 8/8 Tests erfolgreich.
- `npm run lint`: erfolgreich.
- `npm run build`: erfolgreich.
- Die Migration `supabase/sql/015_public_closed_results_rpc.sql` wurde erfolgreich auf das Projekt `Onlineliga` angewendet.
- Anonymer Kontrolltest nach der Migration: 5 freigegebene Ergebnisse aus WK5 und WK7; direkter anonymer Zugriff auf `verein_ergebnisse`: 0 Zeilen.
