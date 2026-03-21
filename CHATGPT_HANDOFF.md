# RTLiga – CHATGPT HANDOFF (Deploy- und Sicherheitsstand)

## Projektziel
RTLiga ist eine React-/Vite-Webapp für:
- Vereinslogin
- Vereinsregistrierung
- Teilnehmerverwaltung
- Ergebniserfassung
- Gesamtergebnisse
- Adminverwaltung
- private Medien aus Supabase Storage

## Aktueller Stand
Dieser ZIP-Stand ist für Veröffentlichung vorbereitet.

Wesentliche Änderungen in diesem Stand:
1. **Admin-Testschlüssel entfernt**
   - `VITE_ADMIN_TEST_KEY` wird nicht mehr verwendet.
   - Adminzugang läuft nur noch über Supabase Auth + `public.admins`.

2. **Adminzugang fest auf einen manuellen Account ausgelegt**
   - vorgesehene Admin-Mail: `df0776@gmx.de`
   - keine Admin-Registrierung im Frontend
   - kein Admin-Passwort-vergessen-Link im Frontend
   - Passwortänderung für Admin nur über Supabase / Admin-Mail

3. **Vereinslogin auf `user_id` umgestellt**
   - Vereinsdaten werden nach erfolgreichem Login über `vereine.user_id = auth.users.id` geladen.

4. **Vereinsregistrierung bereinigt**
   - kein `bcrypt`
   - kein `passwort_hash`
   - es wird nur Supabase Auth verwendet
   - nach `signUp` wird ein Vereinsdatensatz mit `id`, `user_id`, `vereinsname`, `benutzername`, `email` angelegt

5. **Passwort-Reset für Vereine ergänzt**
   - neue Route: `/passwort-vergessen`
   - neue Route: `/passwort-aendern`
   - Reset-Link nutzt `window.location.origin + BASE_URL + "passwort-aendern"`

6. **GitHub Pages vorbereitet**
   - `vite.config.js` nutzt `base: "/rtliga/"`
   - `BrowserRouter` nutzt `basename={import.meta.env.BASE_URL}`
   - `404.html` + `index.html` enthalten SPA-Fallback für Direktaufrufe und Reset-Links

## Kritische Voraussetzung in Supabase
Vor echtem Betrieb muss die SQL-Datei ausgeführt werden:

`supabase/sql/006_public_registration_and_lock_admin.sql`

Diese Datei macht drei wichtige Dinge:
1. erlaubt Vereins-Insert für den eigenen eingeloggten User
2. verriegelt `public.admins`, damit niemand sich selbst als Admin anlegen kann
3. setzt / aktualisiert den einzelnen Admin `df0776@gmx.de`

## Erwartete Supabase-Struktur
### `public.vereine`
Soll enthalten:
- `id uuid`
- `user_id uuid`
- `vereinsname text`
- `benutzername text`
- `email text`

### `public.admins`
Soll enthalten:
- `user_id uuid`
- `email text`
- `role text`
- optional Legacy-Spalten, die aber nicht mehr aktiv genutzt werden

## Wichtige URLs in Supabase
### Site URL
`https://feiseldirk-ui.github.io/rtliga`

### Redirect URLs
- `http://localhost:5173/passwort-aendern`
- `https://feiseldirk-ui.github.io/rtliga/passwort-aendern`

## Wichtige Dateien
- `src/App.jsx`
- `src/main.jsx`
- `src/features/auth/components/VereinLogin.jsx`
- `src/features/auth/components/VereinRegistrierung.jsx`
- `src/features/auth/pages/PasswortVergessen.jsx`
- `src/features/auth/pages/PasswortZuruecksetzen.jsx`
- `src/features/admin/components/AdminsTab.jsx`
- `vite.config.js`
- `404.html`
- `index.html`
- `supabase/sql/006_public_registration_and_lock_admin.sql`

## Regeln für neue Chats
- Immer komplette Dateien ausgeben.
- Immer klar den Dateinamen dazuschreiben.
- Adminzugang nie wieder clientseitig mit Testschlüssel absichern.
- Kein `passwort_hash` im Frontend zurückbringen.
- Für Deployments auf GitHub Pages auf `base: "/rtliga/"` achten.
- Bei Problemen mit Reset-Links zuerst prüfen:
  - ist die neue Version wirklich deployed?
  - stimmen Site URL und Redirect URLs in Supabase?
  - zeigt `404.html` noch auf den SPA-Fallback?

## Mögliche Restbaustellen
- Admin-Tabs enthalten teils noch breite `select`-Abfragen; funktional okay, später weiter härten.
- Wenn RLS in Supabase nochmals geändert wird, zuerst Login/Registrierung/Admin testen.
- Medienzugriff hängt weiterhin an den Storage-Policies in Supabase.

## Empfohlener Test nach neuem Chat
1. `npm install`
2. `npm run build`
3. Deploy ausführen
4. online testen:
   - `/`
   - `/login`
   - `/registrieren`
   - `/passwort-vergessen`
   - `/passwort-aendern`
   - `/admin`
5. Supabase-Reset-Mail erneut testen


## Validierung
- `npm ci` erfolgreich
- `npm run build` erfolgreich
- `dist/404.html` und `dist/.nojekyll` werden für GitHub Pages erzeugt
