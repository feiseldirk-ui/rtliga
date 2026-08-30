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
