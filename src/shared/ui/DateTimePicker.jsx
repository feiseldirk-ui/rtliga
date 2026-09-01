import React, { useId, useRef, useState } from "react";
import { calendarCells, dateKey, pad2, selectionError } from "../../lib/dateTimeSelection";

const months = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export default function DateTimePicker({ label, value, revision, disabled, onChange }) {
  const id = useId();
  const dialog = useRef(null);
  const openedRevision = useRef("");
  const [date, setDate] = useState("");
  const [hour, setHour] = useState("");
  const [minute, setMinute] = useState("");
  const [view, setView] = useState({ year: 2026, month: 0 });
  const [error, setError] = useState("");
  const fingerprint = JSON.stringify([value, revision]);

  const open = () => {
    const seed = value ? new Date(value) : new Date();
    setDate(value ? value.slice(0, 10) : "");
    setHour(value ? value.slice(11, 13) : "");
    setMinute(value ? value.slice(14, 16) : "");
    setView({ year: seed.getFullYear(), month: seed.getMonth() });
    setError("");
    openedRevision.current = fingerprint;
    dialog.current.showModal();
  };
  const shiftMonth = delta => {
    const next = new Date(view.year, view.month + delta, 1);
    if (next.getFullYear() >= 1000 && next.getFullYear() <= 9999) {
      setView({ year: next.getFullYear(), month: next.getMonth() });
    }
  };
  const apply = event => {
    event.preventDefault();
    if (disabled) return;
    const message = selectionError(date, hour, minute, openedRevision.current, fingerprint);
    if (message) { setError(message); return; }
    const nextValue = `${date}T${hour}:${minute}`;
    if (nextValue !== value) onChange(nextValue);
    dialog.current.close();
  };
  const display = value ? new Date(value).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }) : "Datum und Uhrzeit auswählen";
  return (
    <div className="min-w-0">
      <button type="button" aria-label={label + ": " + display} aria-haspopup="dialog" disabled={disabled} onClick={open}
        className="input flex w-full items-center justify-between gap-3 text-left font-normal">
        <span>{display}</span><span aria-hidden="true">▦</span>
      </button>
      <dialog ref={dialog} aria-labelledby={id + "-title"} aria-describedby={id + "-help"}
        className="rounded-3xl border border-indigo-100 bg-white p-0 text-zinc-900 shadow-2xl backdrop:bg-slate-900/40"
        style={{ width: "calc(100vw - 2rem)", maxWidth: "28rem", maxHeight: "90vh" }}>
        <form onSubmit={apply} className="flex flex-col" style={{ maxHeight: "88vh" }}>
          <header className="shrink-0 border-b border-zinc-100 px-5 py-4">
            <h3 id={id + "-title"} className="text-lg font-bold">{label}</h3>
            <p id={id + "-help"} className="mt-1 text-sm font-normal text-zinc-500">Datum und Uhrzeit wählen, dann „Übernehmen“.</p>
          </header>
          <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4">
            <div className="flex items-center justify-between gap-2">
              <button type="button" aria-label="Vorheriger Monat" onClick={() => shiftMonth(-1)} className="btn btn-secondary">‹</button>
              <p className="text-center font-semibold" aria-live="polite">{months[view.month]} {view.year}</p>
              <button type="button" aria-label="Nächster Monat" onClick={() => shiftMonth(1)} className="btn btn-secondary">›</button>
            </div>
            <div className="grid grid-cols-7 gap-1" role="group" aria-label="Kalender">
              {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map(day => <span key={day} className="py-1 text-center text-xs font-semibold text-zinc-500">{day}</span>)}
              {calendarCells(view.year, view.month).map((day, index) => day == null ? <span key={"blank" + index} /> : (
                <button key={day} type="button" aria-label={`${day}. ${months[view.month]} ${view.year}`}
                  aria-pressed={date === dateKey(view.year, view.month, day)}
                  onClick={() => { setDate(dateKey(view.year, view.month, day)); setError(""); }}
                  className={"min-h-10 rounded-xl border text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 " +
                    (date === dateKey(view.year, view.month, day) ? "border-indigo-600 bg-indigo-600 text-white" : "border-transparent bg-zinc-50 text-zinc-800 hover:border-indigo-200 hover:bg-indigo-50")}>
                  {day}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-semibold">Stunde
                <select value={hour} onChange={event => { setHour(event.target.value); setError(""); }} className="input mt-1 w-full" aria-label="Stunde">
                  <option value="">Bitte wählen</option>
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={pad2(h)}>{pad2(h)}</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold">Minute
                <select value={minute} onChange={event => { setMinute(event.target.value); setError(""); }} className="input mt-1 w-full" aria-label="Minute">
                  <option value="">Bitte wählen</option>
                  {Array.from({ length: 60 }, (_, m) => <option key={m} value={pad2(m)}>{pad2(m)}</option>)}
                </select>
              </label>
            </div>
            <p className="rounded-xl bg-indigo-50 p-3 text-sm font-normal text-indigo-900" role="status">
              Auswahl: {date ? date.split("-").reverse().join(".") : "Datum fehlt"} · {hour || "––"}:{minute || "––"} Uhr
            </p>
            {error && <p role="alert" className="text-sm font-normal text-rose-700">{error}</p>}
          </div>
          <footer className="shrink-0 border-t border-zinc-100 bg-white px-5 py-4">
            <div className="flex gap-2">
              <button type="button" onClick={() => dialog.current.close()} className="btn btn-secondary flex-1">Abbrechen</button>
              <button type="submit" disabled={disabled} className="btn btn-primary flex-1">Übernehmen</button>
            </div>
            <p className="mt-3 text-xs font-normal text-zinc-500">Übernimmt nur ins Formular. Danach den WK mit „Änderungen speichern“ sichern.</p>
          </footer>
        </form>
      </dialog>
    </div>
  );
}
