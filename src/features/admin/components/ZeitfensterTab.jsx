import React, { useCallback, useEffect, useReducer, useRef, useState } from "react";
import supabase from "../../../lib/supabase/client";
import { subscribeToTables } from "../../../lib/realtime";
import { getActiveSeason } from "../../../lib/seasonScope";
import { evaluateZeitfenster } from "../../../lib/wettkampfZeitfenster";
import { initialWindowState, toLocalInput, validateWindow, windowReducer, windowSnapshot } from "../../../lib/timeWindowAdmin";

const formatDate = value => value ? new Date(value).toLocaleString("de-DE", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
}) : "–";

async function request(query) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 15000);
  try {
    const { data, error } = await query.abortSignal(controller.signal);
    if (error) throw error;
    return data;
  } finally { window.clearTimeout(timer); }
}
function friendlyError(error) {
  if (error?.code === "55P03") return "Ein anderer Speichervorgang läuft noch. Bitte kurz warten und den gespeicherten Stand neu laden. Dein Entwurf bleibt erhalten.";
  if (error?.code === "23P01") return "Überschneidung: Ein anderer WK ist in diesem Zeitraum bereits geöffnet. Bitte gespeicherten Stand laden und Zeiten anpassen.";
  if (error?.code === "PGRST202") return "Die neue Zeitfenster-Funktion ist in Supabase noch nicht eingerichtet. Bitte zuerst das zugehörige SQL installieren.";
  if (error?.code === "42501") return "Keine Adminberechtigung oder Anmeldung abgelaufen. Bitte erneut anmelden.";
  if (/abort|fetch|network|timeout/i.test(error?.message || "")) return "Keine Speicherbestätigung erhalten. Bitte den gespeicherten Stand neu laden und prüfen, bevor du erneut speicherst.";
  return error?.message || "Speichern konnte nicht bestätigt werden. Dein Entwurf bleibt erhalten.";
}

export default function ZeitfensterTab({ onRefreshStats }) {
  const [state, dispatch] = useReducer(windowReducer, initialWindowState);
  const [season] = useState(() => getActiveSeason());
  const [now, setNow] = useState(() => Date.now());
  const requestId = useRef(0);
  const busy = useRef(false);
  const mounted = useRef(true);
  const statsCallback = useRef(onRefreshStats);
  useEffect(() => { statsCallback.current = onRefreshStats; }, [onRefreshStats]);
  const load = useCallback(async () => {
    if (busy.current) return;
    const id = ++requestId.current;
    dispatch({ type: "load" });
    try {
      const rows = await request(supabase.from("zeitfenster").select("id,wettkampf,start,ende,saison").eq("saison", String(season)).order("wettkampf"));
      if (mounted.current && id === requestId.current) dispatch({ type: "loaded", rows: rows || [] });
    } catch {
      if (mounted.current && id === requestId.current) dispatch({ type: "load-error", message: "Zeitfenster konnten nicht geladen werden. Vorhandene Werte und Entwürfe bleiben erhalten. Bitte erneut laden." });
    }
  }, [season]);
  useEffect(() => {
    mounted.current = true;
    const initial = window.setTimeout(load, 0);
    const tick = window.setInterval(() => setNow(Date.now()), 30000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    const unsubscribe = subscribeToTables({ tables: ["zeitfenster"], onChange: load });
    return () => {
      mounted.current = false;
      requestId.current += 1;
      window.clearTimeout(initial);
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe();
    };
  }, [load]);
  const dirty = Object.keys(state.drafts).length > 0;
  useEffect(() => {
    const warn = event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = async (wk, reset = false) => {
    if (busy.current || state.loading || state.loadError) return;
    const row = state.rows.find(item => Number(item.wettkampf) === wk);
    const draft = state.drafts[wk];
    if (reset) {
      if (!row || !window.confirm("Zeitfenster von WK" + wk + " für Saison " + season + " wirklich entfernen? Beginn und Ende werden gelöscht. Ergebnisse bleiben erhalten, sind ohne Zeitfenster aber gegebenenfalls nicht mehr öffentlich sichtbar.")) return;
    } else {
      if (!draft) return;
      const message = validateWindow(draft, state.rows);
      if (message) { dispatch({ type: "error", wk, message }); return; }
    }
    busy.current = true;
    requestId.current += 1;
    dispatch({ type: "pending", wk });
    try {
      const result = await request(supabase.rpc("admin_save_wk_window", {
        p_saison: String(season), p_wettkampf: wk,
        p_start: reset ? null : new Date(draft.start).toISOString(),
        p_ende: reset ? null : new Date(draft.ende).toISOString(),
        p_expected: reset ? windowSnapshot(row) : draft.expected, p_reset: reset,
      }));
      if (!result || result.wettkampf !== wk || result.reset !== reset || (!reset && !result.row?.id)) {
        throw new Error("Unvollständige Speicherbestätigung. Bitte gespeicherten Stand neu laden und prüfen.");
      }
      if (!mounted.current) return;
      dispatch({ type: "saved", wk, row: result.row, message: reset
        ? "WK" + wk + ": Zeitfenster entfernt. In der Datenbank bestätigt."
        : "WK" + wk + " gespeichert: " + formatDate(result.row.start) + " – " + formatDate(result.row.ende) + ". In der Datenbank bestätigt." });
      setNow(Date.now());
      Promise.resolve().then(() => statsCallback.current?.()).catch(() => undefined);
    } catch (error) {
      if (mounted.current) dispatch({ type: "error", wk, message: friendlyError(error) });
    } finally { busy.current = false; }
  };
  const opened = state.rows.filter(row => evaluateZeitfenster(row, now).offen).length;
  const labels = { open: "Offen", closed: "Geschlossen", upcoming: "Bevorstehend", invalid: "Ungültig", not_set: "Nicht festgelegt" };
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <div className="space-y-5">
      <header className="rounded-3xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Wettkampfplanung · Saison {season}</p>
        <h2 className="mt-2 text-2xl font-semibold text-zinc-900">WK-Zeitfenster</h2>
        <p className="mt-2 text-sm text-zinc-600">Nur ein WK darf gleichzeitig offen sein. Beginn und Ende gemeinsam bearbeiten und anschließend speichern.</p>
        <p className="mt-2 text-sm text-zinc-600">Alle Uhrzeiten: {timezone}. Beginn und Ende zählen zum offenen Zeitraum; zwischen zwei Fenstern mindestens eine Minute Abstand lassen.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-full border bg-white px-3 py-2">{state.rows.filter(row => row.start && row.ende).length} von 9 festgelegt</span>
          <span className="rounded-full border bg-white px-3 py-2">{opened} aktuell offen</span>
          <button className="btn btn-secondary" onClick={load} disabled={state.loading || state.pending !== null}>{state.loading ? "Lädt …" : "Gespeicherten Stand laden"}</button>
        </div>
      </header>
      {state.loadError && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">{state.loadError}</div>}
      {opened > 1 && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">Der gespeicherte Altbestand enthält mehrere offene WK. Bitte die überlappenden Zeitfenster korrigieren.</div>}
      {dirty && <p className="text-sm text-amber-800" role="status">Ungespeicherte Änderungen vorhanden. Automatisches Nachladen überschreibt deine Entwürfe nicht.</p>}
      {Array.from({ length: 9 }, (_, i) => i + 1).map(wk => {
        const row = state.rows.find(item => Number(item.wettkampf) === wk);
        const draft = state.drafts[wk];
        const status = evaluateZeitfenster(row, now);
        const feedback = state.feedback[wk];
        const disabled = state.pending !== null || state.loading || !!state.loadError;
        return (
          <section key={wk} aria-label={"WK" + wk} className={"rounded-3xl border p-4 sm:p-5 " + (status.offen ? "border-emerald-300 bg-emerald-50/40" : "border-zinc-200 bg-white")}>
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-lg font-bold text-zinc-900">WK{wk}</h3>
              <span className="rounded-full border bg-white px-3 py-1 text-xs">{labels[status.code]}</span>
              {draft && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Nicht gespeichert</span>}
            </div>
            <p className="mt-2 text-sm text-zinc-600">Gespeicherter Stand: {row?.start && row?.ende ? formatDate(row.start) + " – " + formatDate(row.ende) : "Kein Zeitfenster"}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[["start", "Beginn"], ["ende", "Ende"]].map(([field, label]) => (
                <label key={field} className="block min-w-0 text-sm font-semibold text-zinc-700">
                  {label}
                  <input aria-label={"WK" + wk + " " + label} type="datetime-local" step="60" className="input mt-1 block w-full min-w-0" disabled={disabled}
                    value={draft ? draft[field] : toLocalInput(row?.[field])}
                    onChange={event => dispatch({ type: "edit", wk, field, value: event.target.value })} />
                </label>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn btn-primary" onClick={() => save(wk)} disabled={disabled || !draft}>{state.pending === wk ? "Wird gespeichert …" : "Änderungen speichern"}</button>
              <button className="btn btn-secondary" onClick={() => dispatch({ type: "discard", wk })} disabled={disabled || !draft}>Änderungen verwerfen</button>
              <button className="btn btn-secondary !text-rose-700" onClick={() => save(wk, true)} disabled={disabled || !row}>Zeitfenster entfernen</button>
            </div>
            {feedback && <div role={feedback.tone === "error" ? "alert" : "status"} className={"mt-4 rounded-2xl border px-4 py-3 text-sm " + (feedback.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : feedback.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-zinc-200 bg-zinc-50 text-zinc-700")}>{feedback.text}</div>}
          </section>
        );
      })}
    </div>
  );
}
