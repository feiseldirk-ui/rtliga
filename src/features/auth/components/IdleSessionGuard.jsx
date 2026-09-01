import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import supabase from "../../../lib/supabase/client";
import { sessionIdentity } from "../../../lib/clubSessionCore";
import { clubSessionApi } from "../../../lib/vereinSessionLock";
import { clearVereinSession, readVereinSession } from "../../../lib/storage/vereinSession";
import { createIdleClock, formatIdleCountdown, isIdleActivity, logoutMatchingSession } from "../../../lib/idleSessionCore";
import { stopGlobalAudio } from "../../../shared/media/audioPlayer";
import AppDialog from "../../../shared/ui/AppDialog";

export default function IdleSessionGuard({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState({ phase: "active", remainingMs: 0 });
  const [ending, setEnding] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmSwitch, setConfirmSwitch] = useState(null);
  const clockRef = useRef(null);
  const identityRef = useRef(null);
  const endingRef = useRef(null);
  const requestRef = useRef(false);
  const mountedRef = useRef(false);
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;
  const identity = sessionIdentity(session);

  const finish = useCallback(async () => {
    const task = endingRef.current;
    if (!task || requestRef.current) return;
    requestRef.current = true;
    setError("");
    let timeout;
    try {
      // Timeout changes feedback only. The original operation stays single-flight.
      timeout = window.setTimeout(() => {
        if (mountedRef.current) setError("Die Abmeldung dauert länger. Eingaben bleiben gesperrt. Bitte Verbindung prüfen.");
      }, 15000);
      const result = await logoutMatchingSession(supabase, clubSessionApi, task.club, task.identity, sessionIdentity);
      if (!mountedRef.current || endingRef.current !== task) return;
      endingRef.current = null;
      setEnding(null);
      if (result.changed) {
        setNotice("Die Anmeldung wurde zwischenzeitlich gewechselt. Das neue Konto wurde nicht abgemeldet.");
        return;
      }
      clearVereinSession();
      try {
        sessionStorage.removeItem("rtliga_admin_access_verified");
        sessionStorage.removeItem("rtliga_admin_logout_redirect");
      } catch { /* The auth operation above remains authoritative. */ }
      setSession(null);
      setNotice(task.reason === "idle"
        ? "Nach 15 Minuten ohne Bedienung abgemeldet. Ungespeicherte Eingaben wurden nicht automatisch gespeichert."
        : "Das bisherige Konto wurde in diesem Browser abgemeldet. Du kannst dich jetzt neu anmelden.");
      navigate(task.target, { replace: true });
    } catch (failure) {
      if (mountedRef.current && endingRef.current === task) setError(failure.message || "Abmelden fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      window.clearTimeout(timeout);
      requestRef.current = false;
    }
  }, [navigate]);

  const beginLogout = useCallback((reason = "idle", target) => {
    if (endingRef.current || !identityRef.current) return;
    clockRef.current?.expire(reason);
    const task = { identity: identityRef.current, club: readVereinSession(), reason,
      target: target || (pathRef.current === "/admin" ? "/admin" : "/login") };
    endingRef.current = task;
    setEnding(task);
    setConfirmSwitch(null);
    stopGlobalAudio();
    // Stops club renewals immediately, also during offline/failed auth logout.
    window.dispatchEvent(new Event("rtliga-club-session-ended"));
    void finish();
  }, [finish]);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    let authEvents = 0;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      authEvents++;
      if (!cancelled) { setSession(next); setReady(true); }
    });
    const snapshot = authEvents;
    supabase.auth.getSession().then(({ data, error: authError }) => {
      if (cancelled || snapshot !== authEvents) return;
      if (authError) { setError("Anmeldung konnte nicht geladen werden. Bitte die Seite erneut öffnen."); return; }
      setSession(data?.session || null); setReady(true);
    }).catch(() => { if (!cancelled) setError("Anmeldung konnte nicht geladen werden. Bitte die Seite erneut öffnen."); });
    return () => { cancelled = true; mountedRef.current = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    identityRef.current = identity;
    if (!identity) { clockRef.current = null; setState({ phase: "active", remainingMs: 0 }); return; }
    let storage;
    try { storage = window.localStorage; } catch { storage = null; }
    const wall = Date.now(), monotonic = performance.now();
    const now = () => Math.max(Date.now(), wall + performance.now() - monotonic);
    const clock = createIdleClock({ identity, storage, now });
    clockRef.current = clock;
    const update = next => {
      setState(next);
      if (next.phase === "expired") beginLogout(next.storageFailed ? "storage" : "idle");
    };
    const tick = () => update(clock.tick());
    let lastEvent = 0;
    const activity = event => {
      if (endingRef.current) return;
      if (!isIdleActivity(event, document.visibilityState === "visible")) return;
      // Timer expiry is always checked BEFORE allowing the triggering click/key.
      const status = clock.tick();
      if (status.phase === "expired") {
        event.preventDefault(); event.stopImmediatePropagation(); update(status); return;
      }
      if (now() - lastEvent < 1000) return;
      lastEvent = now(); update(clock.activity());
    };
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "input"];
    events.forEach(name => window.addEventListener(name, activity, { capture: true, passive: false }));
    window.addEventListener("storage", tick);
    window.addEventListener("focus", tick);
    window.addEventListener("pageshow", tick);
    document.addEventListener("visibilitychange", tick);
    const timer = window.setInterval(tick, 1000);
    tick();
    return () => {
      window.clearInterval(timer);
      events.forEach(name => window.removeEventListener(name, activity, true));
      window.removeEventListener("storage", tick); window.removeEventListener("focus", tick);
      window.removeEventListener("pageshow", tick); document.removeEventListener("visibilitychange", tick);
      if (clockRef.current === clock) clockRef.current = null;
    };
  }, [identity, beginLogout]);

  useEffect(() => {
    const requestSwitch = event => {
      if (identityRef.current && !endingRef.current) setConfirmSwitch({ identity: identityRef.current, target: event.detail?.target === "/admin" ? "/admin" : "/login" });
      else if (!identityRef.current) setNotice("Es ist kein Konto mehr gespeichert. Bitte erneut anmelden.");
    };
    const requestLogout = () => beginLogout("manual");
    const online = () => { if (endingRef.current) void finish(); };
    window.addEventListener("rtliga-confirm-account-switch", requestSwitch);
    window.addEventListener("rtliga-request-logout", requestLogout);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("rtliga-confirm-account-switch", requestSwitch);
      window.removeEventListener("rtliga-request-logout", requestLogout);
      window.removeEventListener("online", online);
    };
  }, [beginLogout, finish]);

  const warning = Boolean(identity && state.phase === "warning" && !ending);
  const hardBlocked = Boolean(ending || !ready || (session && !identity));
  return <>
    {!hardBlocked && <div inert={warning || Boolean(confirmSwitch) || undefined}>
      {notice && <div role="status" className="m-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</div>}
      {children}
    </div>}
    {hardBlocked && <div className="min-h-screen bg-zinc-50" />}
    <AppDialog open={warning || hardBlocked || Boolean(confirmSwitch)}
      title={ending ? "Sitzung wird beendet" : confirmSwitch ? "Gespeichertes Konto wechseln?" : warning ? "Noch angemeldet bleiben?" : "Anmeldung wird geprüft"}
      onCancel={confirmSwitch ? () => setConfirmSwitch(null) : undefined}>
      {warning && !confirmSwitch && <>
        <p className="mt-3 text-sm leading-6 text-zinc-600">Seit 13 Minuten wurde die App nicht bedient. Die automatische Abmeldung erfolgt in:</p>
        <p className="mt-4 text-4xl font-bold tabular-nums text-indigo-600" role="timer">{formatIdleCountdown(state.remainingMs)}</p>
        <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">Ungespeicherte Eingaben gehen bei der Abmeldung verloren. „Angemeldet bleiben“ wählen und anschließend speichern.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary" onClick={() => {
            const next = clockRef.current?.activity({ explicit: true });
            if (next) { setState(next); if (next.phase === "expired") beginLogout(); }
          }}>Angemeldet bleiben</button>
          <button type="button" className="btn btn-secondary" onClick={() => beginLogout("manual")}>Jetzt abmelden</button>
        </div>
      </>}
      {confirmSwitch && !ending && <>
        <p className="mt-3 text-sm leading-6 text-zinc-600">Das gespeicherte Konto wird in diesem Browser abgemeldet. Andere Tabs mit derselben Anmeldung werden ebenfalls abgemeldet. Ungespeicherte Eingaben dort gehen verloren. Andere Geräte werden nicht global abgemeldet.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" className="btn btn-secondary" onClick={() => setConfirmSwitch(null)}>Abbrechen</button>
          <button type="button" className="btn btn-primary" onClick={() => {
            if (confirmSwitch.identity !== identityRef.current) { setConfirmSwitch(null); return; }
            beginLogout("switch", confirmSwitch.target);
          }}>Abmelden und Konto wechseln</button>
        </div>
      </>}
      {hardBlocked && <>
        <p className="mt-3 text-sm leading-6 text-zinc-600">{ending ? "Eingaben sind gesperrt. Die Abmeldung wird mit dem Server abgeglichen; ungespeicherte Eingaben werden nicht automatisch gespeichert." : "Bitte kurz warten."}</p>
        {error && <p role="alert" className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {ending && error && <button type="button" className="btn btn-primary mt-5" disabled={requestRef.current} onClick={() => void finish()}>{requestRef.current ? "Abmeldung läuft…" : "Abmeldung erneut versuchen"}</button>}
      </>}
    </AppDialog>
  </>;
}
