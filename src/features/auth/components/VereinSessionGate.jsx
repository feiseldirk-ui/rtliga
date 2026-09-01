import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../../../lib/supabase/client";
import { clearVereinSession, writeVereinSession } from "../../../lib/storage/vereinSession";
import { clubSessionApi } from "../../../lib/vereinSessionLock";
import { createClubSessionMonitor, endClubSession, sessionIdentity, sessionMessage } from "../../../lib/clubSessionCore";

export default function VereinSessionGate({ verein, children }) {
  const navigate = useNavigate();
  const monitorRef = useRef(null);
  const identityRef = useRef(null);
  const dialogRef = useRef(null);
  const [state, setState] = useState({ phase: "checking", reason: null, started: false });
  const [attempt, setAttempt] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let identity = verein.identity || null;
    const monitor = createClubSessionMonitor({
      api: clubSessionApi, clubId: verein.id, locks: navigator.locks,
      onChange: (next) => { if (!cancelled) setState(next); },
    });
    monitorRef.current = monitor;
    const init = async () => {
      const result = await supabase.auth.getSession();
      if (cancelled) return;
      if (result.error) throw result.error;
      const actual = sessionIdentity(result.data?.session);
      if (!actual || (identity && actual !== identity)) {
        setState({ phase: "blocked", reason: "account_changed", started: false });
        return;
      }
      identity = actual;
      identityRef.current = actual;
      writeVereinSession({ id: verein.id, vereinsname: verein.vereinsname, identity: actual });
      monitor.start();
    };
    init().catch(() => { if (!cancelled) setState({ phase: "blocked", reason: "network", started: false }); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (identity && sessionIdentity(session) !== identity) monitor.block("account_changed");
    });
    const check = () => { if (document.visibilityState === "visible") monitor.check({ pause: true }); };
    const offline = () => monitor.block("network");
    const ended = () => monitor.block("ended");
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    window.addEventListener("offline", offline);
    window.addEventListener("rtliga-club-session-ended", ended);
    document.addEventListener("visibilitychange", check);
    return () => {
      cancelled = true;
      monitor.stop();
      subscription.unsubscribe();
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
      window.removeEventListener("offline", offline);
      window.removeEventListener("rtliga-club-session-ended", ended);
      document.removeEventListener("visibilitychange", check);
    };
  }, [verein.id, verein.identity, verein.vereinsname, attempt]);

  const blocked = state.phase !== "active";
  useEffect(() => {
    const dialog = dialogRef.current;
    if (blocked && !dialog.open) dialog.showModal();
    if (!blocked && dialog.open) dialog.close();
  }, [blocked]);

  const exit = async () => {
    setLeaving(true);
    setLeaveError("");
    try {
      // A blocked secondary tab must NEVER sign out the active tab/account.
      if (!["tab_busy", "unsupported", "account_changed"].includes(state.reason)) {
        monitorRef.current?.stop();
        await endClubSession(supabase, clubSessionApi, verein.id, identityRef.current);
      }
      clearVereinSession();
      navigate("/", { replace: true });
    } catch {
      setLeaveError("Abmelden konnte nicht bestätigt werden. Bitte Verbindung prüfen und erneut versuchen.");
    } finally {
      setLeaving(false);
    }
  };

  return (
    <>
      <div inert={blocked || undefined} aria-hidden={blocked || undefined}>
        {state.started ? children : null}
      </div>
      <dialog ref={dialogRef} onCancel={(event) => event.preventDefault()}
        aria-labelledby="club-session-heading" aria-describedby="club-session-description"
        className="m-auto w-[calc(100%_-_2rem)] max-w-lg rounded-[28px] border border-zinc-200 bg-white p-0 shadow-2xl backdrop:bg-zinc-950/50">
        <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-500" />
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <h2 id="club-session-heading" className="text-xl font-bold text-zinc-950">
            {state.phase === "checking" ? "Vereinssitzung wird geprüft…" : "Vereinssitzung geschützt"}
          </h2>
          <p id="club-session-description" className="mt-3 text-sm leading-6 text-zinc-600" aria-live="polite">
            {state.phase === "checking" ? "Bitte kurz warten. Der Vereinsbereich öffnet sich erst nach der Bestätigung des Servers." : sessionMessage(state.reason)}
          </p>
          {state.started && <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">Beim Verlassen gehen ungespeicherte Eingaben verloren. Bei einer vorübergehenden Störung kannst du hier bleiben und erneut prüfen.</p>}
          {leaveError && <p role="alert" className="mt-3 text-sm text-rose-700">{leaveError}</p>}
          {state.phase === "blocked" && <div className="mt-6 flex flex-wrap gap-3">
            {!["ended", "account_changed", "unsupported"].includes(state.reason) && <button type="button" className="btn btn-primary" disabled={leaving} onClick={() => {
              if (state.reason === "tab_busy" || !state.started) setAttempt((value) => value + 1);
              else monitorRef.current?.check();
            }}>Erneut prüfen</button>}
            <button type="button" className="btn btn-secondary" disabled={leaving} onClick={exit}>
              {leaving ? "Wird beendet…" : state.started ? "Eingaben verwerfen und verlassen" : "Zur Startseite"}
            </button>
          </div>}
        </div>
      </dialog>
    </>
  );
}
